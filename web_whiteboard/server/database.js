/**
 * SQLite Database Manager for Collaborative Whiteboard
 * Uses Node.js native DatabaseSync (node:sqlite) with resilient fallback.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'whiteboard_data.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#0284c7',
    avatar_url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    host_user_code TEXT NOT NULL,
    host_name TEXT NOT NULL,
    is_public INTEGER DEFAULT 1,
    password TEXT DEFAULT NULL,
    locked INTEGER DEFAULT 0,
    presentation_mode INTEGER DEFAULT 0,
    chat_permission TEXT DEFAULT 'everyone',
    instance_save_perm TEXT DEFAULT 'everyone',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS room_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    user_code TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    can_draw INTEGER DEFAULT 1,
    can_save_instance INTEGER DEFAULT 1,
    joined_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(room_code, user_code)
  );

  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    user_code TEXT,
    user_name TEXT,
    kind TEXT NOT NULL,
    data_json TEXT NOT NULL,
    seq INTEGER NOT NULL,
    undone INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    sender_code TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    avatar_color TEXT,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    title TEXT NOT NULL,
    author_code TEXT NOT NULL,
    author_name TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS public_works (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    title TEXT NOT NULL,
    author_code TEXT NOT NULL,
    author_name TEXT NOT NULL,
    image_data TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(user_code);
  CREATE INDEX IF NOT EXISTS idx_members_room ON room_members(room_code);
  CREATE INDEX IF NOT EXISTS idx_actions_room ON actions(room_code);
  CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_code);
  CREATE INDEX IF NOT EXISTS idx_milestones_room ON milestones(room_code);
  CREATE INDEX IF NOT EXISTS idx_public_works_room ON public_works(room_code);
`);

// Safe migrations for custom permissions
try { db.exec("ALTER TABLE room_members ADD COLUMN can_chat INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE room_members ADD COLUMN can_instances INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE room_members ADD COLUMN can_public_work INTEGER DEFAULT 1"); } catch(e) {}

try { db.exec("ALTER TABLE rooms ADD COLUMN canva_perm TEXT DEFAULT 'everyone'"); } catch(e) {}
try { db.exec("ALTER TABLE rooms ADD COLUMN chat_perm TEXT DEFAULT 'everyone'"); } catch(e) {}
try { db.exec("ALTER TABLE rooms ADD COLUMN instances_perm TEXT DEFAULT 'everyone'"); } catch(e) {}
try { db.exec("ALTER TABLE rooms ADD COLUMN public_work_perm TEXT DEFAULT 'everyone'"); } catch(e) {}

/**
 * Generate a unique 8-character Account Code: USR-XXXX
 */
export function generateUserCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  while (true) {
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `USR-${rand}`;
    const stmt = db.prepare('SELECT id FROM users WHERE user_code = ?');
    const existing = stmt.get(code);
    if (!existing) return code;
  }
}

/**
 * Register or login a user account
 */
export function createOrGetUser(name, email, avatarColor = '#0284c7', avatarUrl = '') {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  // Find existing by email
  const findStmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?');
  const existing = findStmt.get(trimmedEmail);

  if (existing) {
    // Update name or avatar if provided
    const updateStmt = db.prepare(`
      UPDATE users 
      SET name = ?, avatar_color = COALESCE(NULLIF(?, ''), avatar_color), avatar_url = COALESCE(NULLIF(?, ''), avatar_url)
      WHERE id = ?
    `);
    updateStmt.run(trimmedName, avatarColor, avatarUrl, existing.id);
    return findStmt.get(trimmedEmail);
  }

  const userCode = generateUserCode();
  const insertStmt = db.prepare(`
    INSERT INTO users (user_code, name, email, avatar_color, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStmt.run(userCode, trimmedName, trimmedEmail, avatarColor, avatarUrl);

  const getStmt = db.prepare('SELECT * FROM users WHERE user_code = ?');
  return getStmt.get(userCode);
}

export function getUserByCode(userCode) {
  const stmt = db.prepare('SELECT * FROM users WHERE UPPER(user_code) = ?');
  return stmt.get(userCode.trim().toUpperCase());
}

export function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?');
  return stmt.get(email.trim().toLowerCase());
}

/**
 * Room Management
 */
export function createRoom(code, title, hostUserCode, hostName, isPublic = true, password = null) {
  const cleanCode = code.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO rooms (code, title, host_user_code, host_name, is_public, password)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      title = excluded.title,
      updated_at = datetime('now', 'localtime')
  `);
  stmt.run(cleanCode, title.trim(), hostUserCode, hostName, isPublic ? 1 : 0, password);

  // Enroll host in room members
  addRoomMember(cleanCode, hostUserCode, hostName, 'host', 1);

  return getRoom(cleanCode);
}

export function getRoom(code) {
  const stmt = db.prepare('SELECT * FROM rooms WHERE UPPER(code) = ?');
  return stmt.get(code.trim().toUpperCase());
}

export function listPublicRooms() {
  const stmt = db.prepare(`
    SELECT r.*, 
      (SELECT COUNT(*) FROM room_members m WHERE m.room_code = r.code) as member_count
    FROM rooms r 
    WHERE r.is_public = 1 AND r.locked = 0
    ORDER BY r.updated_at DESC
  `);
  return stmt.all();
}

export function updateRoomSettings(code, settings) {
  const cleanCode = code.trim().toUpperCase();
  const fields = [];
  const values = [];

  if (settings.title !== undefined) {
    fields.push('title = ?');
    values.push(settings.title);
  }
  if (settings.locked !== undefined) {
    fields.push('locked = ?');
    values.push(settings.locked ? 1 : 0);
  }
  if (settings.presentation_mode !== undefined) {
    fields.push('presentation_mode = ?');
    values.push(settings.presentation_mode ? 1 : 0);
  }
  if (settings.chat_permission !== undefined) {
    fields.push('chat_permission = ?');
    values.push(settings.chat_permission);
  }
  if (settings.instance_save_perm !== undefined) {
    fields.push('instance_save_perm = ?');
    values.push(settings.instance_save_perm);
  }

  if (fields.length === 0) return getRoom(cleanCode);

  fields.push("updated_at = datetime('now', 'localtime')");
  values.push(cleanCode);

  const query = `UPDATE rooms SET ${fields.join(', ')} WHERE UPPER(code) = ?`;
  const stmt = db.prepare(query);
  stmt.run(...values);

  return getRoom(cleanCode);
}

/**
 * Member Roster & Permissions
 */
export function addRoomMember(roomCode, userCode, name, role = 'member', canDraw = 1) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO room_members (room_code, user_code, name, role, can_draw)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(room_code, user_code) DO UPDATE SET
      name = excluded.name,
      role = CASE WHEN room_members.role = 'host' THEN 'host' ELSE excluded.role END
  `);
  stmt.run(cleanRoom, userCode, name, role, canDraw ? 1 : 0);
}

export function getRoomMembers(roomCode) {
  const stmt = db.prepare(`
    SELECT m.*, u.avatar_color, u.avatar_url, u.email
    FROM room_members m
    LEFT JOIN users u ON m.user_code = u.user_code
    WHERE UPPER(m.room_code) = ?
    ORDER BY CASE m.role WHEN 'host' THEN 1 WHEN 'cohost' THEN 2 ELSE 3 END, m.name ASC
  `);
  return stmt.all(roomCode.trim().toUpperCase());
}

export function updateMemberPermission(roomCode, userCode, canDraw, isCohost = null) {
  const cleanRoom = roomCode.trim().toUpperCase();
  if (isCohost !== null) {
    const role = isCohost ? 'cohost' : 'member';
    const stmt = db.prepare(`
      UPDATE room_members
      SET can_draw = ?, role = CASE WHEN role = 'host' THEN 'host' ELSE ? END
      WHERE UPPER(room_code) = ? AND user_code = ?
    `);
    stmt.run(canDraw ? 1 : 0, role, cleanRoom, userCode);
  } else {
    const stmt = db.prepare(`
      UPDATE room_members
      SET can_draw = ?
      WHERE UPPER(room_code) = ? AND user_code = ?
    `);
    stmt.run(canDraw ? 1 : 0, cleanRoom, userCode);
  }
}

export function setAllMembersDrawingPermission(roomCode, canDraw) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    UPDATE room_members
    SET can_draw = ?
    WHERE UPPER(room_code) = ? AND role != 'host'
  `);
  stmt.run(canDraw ? 1 : 0, cleanRoom);
}

export function removeRoomMember(roomCode, userCode) {
  const stmt = db.prepare('DELETE FROM room_members WHERE UPPER(room_code) = ? AND user_code = ? AND role != "host"');
  stmt.run(roomCode.trim().toUpperCase(), userCode);
}

/**
 * Google Classroom Style: Get all boards a user is enrolled in
 */
export function getUserEnrolledRooms(userCode) {
  const stmt = db.prepare(`
    SELECT r.code, r.title, r.host_name, r.host_user_code, r.locked, r.created_at, r.updated_at,
      m.role, m.can_draw,
      (SELECT COUNT(*) FROM room_members rm WHERE rm.room_code = r.code) as member_count,
      (SELECT COUNT(*) FROM actions a WHERE a.room_code = r.code AND a.undone = 0) as action_count
    FROM room_members m
    JOIN rooms r ON m.room_code = r.code
    WHERE m.user_code = ?
    ORDER BY r.updated_at DESC
  `);
  return stmt.all(userCode);
}

/**
 * Actions (Drawing strokes, shapes, text, etc.)
 */
export function saveAction(roomCode, action) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO actions (id, room_code, user_code, user_name, kind, data_json, seq, undone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data_json = excluded.data_json,
      undone = excluded.undone
  `);
  stmt.run(
    action.id,
    cleanRoom,
    action.user_code || null,
    action.user || action.user_name || 'User',
    action.kind || 'stroke',
    JSON.stringify(action),
    action.seq || 0,
    action.undone ? 1 : 0
  );

  // Update room activity
  db.prepare("UPDATE rooms SET updated_at = datetime('now', 'localtime') WHERE UPPER(code) = ?").run(cleanRoom);
}

export function updateActionUndone(actionId, undone) {
  const stmt = db.prepare('UPDATE actions SET undone = ? WHERE id = ?');
  stmt.run(undone ? 1 : 0, actionId);
}

export function getRoomActions(roomCode) {
  const stmt = db.prepare(`
    SELECT data_json, undone 
    FROM actions 
    WHERE UPPER(room_code) = ?
    ORDER BY seq ASC, rowid ASC
  `);
  const rows = stmt.all(roomCode.trim().toUpperCase());
  return rows.map(r => {
    try {
      const act = JSON.parse(r.data_json);
      act.undone = Boolean(r.undone);
      return act;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function getNextSeq(roomCode) {
  const stmt = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 as next_seq FROM actions WHERE UPPER(room_code) = ?');
  return stmt.get(roomCode.trim().toUpperCase()).next_seq;
}

/**
 * Chat Messages
 */
export function saveChatMessage(roomCode, msg) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO chat_messages (id, room_code, sender_code, sender_name, avatar_color, message, timestamp, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    msg.id,
    cleanRoom,
    msg.sender_code || 'system',
    msg.sender_name || 'System',
    msg.avatar_color || '#2563eb',
    msg.message || msg.text || '',
    msg.timestamp || '',
    msg.is_system ? 1 : 0
  );
}

export function getChatHistory(roomCode) {
  const stmt = db.prepare(`
    SELECT id, sender_code, sender_name, avatar_color, message, timestamp, is_system
    FROM chat_messages
    WHERE UPPER(room_code) = ?
    ORDER BY rowid ASC
    LIMIT 200
  `);
  return stmt.all(roomCode.trim().toUpperCase()).map(m => ({
    ...m,
    is_system: Boolean(m.is_system),
  }));
}

export function clearRoomChat(roomCode) {
  const stmt = db.prepare('DELETE FROM chat_messages WHERE UPPER(room_code) = ?');
  stmt.run(roomCode.trim().toUpperCase());
}

/**
 * Milestones (Saved Canvas Instances)
 */
export function saveMilestone(roomCode, milestone) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO milestones (id, room_code, title, author_code, author_name, snapshot_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    milestone.id,
    cleanRoom,
    milestone.title,
    milestone.author_code || '',
    milestone.author_name || milestone.author || 'User',
    JSON.stringify(milestone.snapshot || milestone.actions || []),
    milestone.timestamp || ''
  );
}

export function getRoomMilestones(roomCode) {
  const stmt = db.prepare(`
    SELECT id, title, author_code, author_name, snapshot_json, timestamp
    FROM milestones
    WHERE UPPER(room_code) = ?
    ORDER BY rowid DESC
  `);
  return stmt.all(roomCode.trim().toUpperCase()).map(m => ({
    id: m.id,
    title: m.title,
    author_code: m.author_code,
    author: m.author_name,
    author_name: m.author_name,
    timestamp: m.timestamp,
    snapshot: JSON.parse(m.snapshot_json || '[]')
  }));
}

export function deleteMilestone(milestoneId) {
  const stmt = db.prepare('DELETE FROM milestones WHERE id = ?');
  stmt.run(milestoneId);
}

export function updateMilestoneSnapshot(milestoneId, snapshot) {
  const stmt = db.prepare('UPDATE milestones SET snapshot_json = ? WHERE id = ?');
  stmt.run(JSON.stringify(snapshot || []), milestoneId);
}

/**
 * Public Works (Shared High-Res Screenshots)
 */
export function savePublicWork(roomCode, work) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO public_works (id, room_code, title, author_code, author_name, image_data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      image_data = excluded.image_data
  `);
  stmt.run(
    work.id,
    cleanRoom,
    work.title || 'Whiteboard Snapshot',
    work.author_code || '',
    work.author_name || work.author || 'User',
    work.image_data || work.image || '',
    work.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

export function getPublicWorks(roomCode) {
  const stmt = db.prepare(`
    SELECT id, title, author_code, author_name, image_data, timestamp, created_at
    FROM public_works
    WHERE UPPER(room_code) = ?
    ORDER BY rowid DESC
  `);
  return stmt.all(roomCode.trim().toUpperCase());
}

export function deletePublicWork(workId) {
  const stmt = db.prepare('DELETE FROM public_works WHERE id = ?');
  stmt.run(workId);
}

/**
 * Host 3-Option Permissions Control Matrix
 */
export function updateRoomPermissions(roomCode, perms) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    UPDATE rooms 
    SET canva_perm = COALESCE(?, canva_perm),
        chat_perm = COALESCE(?, chat_perm),
        instances_perm = COALESCE(?, instances_perm),
        public_work_perm = COALESCE(?, public_work_perm),
        updated_at = datetime('now', 'localtime')
    WHERE UPPER(code) = ?
  `);
  stmt.run(perms.canva_perm || null, perms.chat_perm || null, perms.instances_perm || null, perms.public_work_perm || null, cleanRoom);
}

export function updateMemberCustomPermissions(roomCode, userCode, perms) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const stmt = db.prepare(`
    UPDATE room_members
    SET can_draw = COALESCE(?, can_draw),
        can_chat = COALESCE(?, can_chat),
        can_instances = COALESCE(?, can_instances),
        can_public_work = COALESCE(?, can_public_work)
    WHERE UPPER(room_code) = ? AND user_code = ?
  `);
  stmt.run(
    perms.can_draw !== undefined ? (perms.can_draw ? 1 : 0) : null,
    perms.can_chat !== undefined ? (perms.can_chat ? 1 : 0) : null,
    perms.can_instances !== undefined ? (perms.can_instances ? 1 : 0) : null,
    perms.can_public_work !== undefined ? (perms.can_public_work ? 1 : 0) : null,
    cleanRoom,
    userCode
  );
}

export default {
  createOrGetUser,
  getUserByCode,
  getUserByEmail,
  generateUserCode,
  createRoom,
  getRoom,
  listPublicRooms,
  updateRoomSettings,
  updateRoomPermissions,
  updateMemberCustomPermissions,
  addRoomMember,
  getRoomMembers,
  updateMemberPermission,
  setAllMembersDrawingPermission,
  removeRoomMember,
  getUserEnrolledRooms,
  saveAction,
  updateActionUndone,
  getRoomActions,
  getNextSeq,
  saveChatMessage,
  getChatHistory,
  clearRoomChat,
  saveMilestone,
  getRoomMilestones,
  deleteMilestone,
  updateMilestoneSnapshot,
  savePublicWork,
  getPublicWorks,
  deletePublicWork
};


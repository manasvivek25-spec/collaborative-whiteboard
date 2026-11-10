/**
 * Cross-Network Collaborative Whiteboard Server
 * Full-Stack Express + WebSocket + SQLite Architecture
 * 
 * Accessible across:
 * - Mobile cellular networks (4G/5G)
 * - Home / Office Wi-Fi routers
 * - Zero-internet Localhost & Ad-hoc LAN
 * - Cloud deployments (Render, Railway, Fly.io, etc.)
 */

import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// In-memory active session connections
// room_code -> Map(user_code -> Set(ws))
const roomSockets = new Map();
// user_code -> Set(ws)
const userSockets = new Map();
// ws -> { user_code, user_name, room_code, avatar_color, ip }
const wsMeta = new WeakMap();

// ── REST API ROUTES ──────────────────────────────────────────────────

// Health check for Cloud Hosting platforms (Render, Railway, etc.)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Network Discovery API (For zero-internet Hotspot, Wi-Fi LAN, and Localhost)
app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push({
          interface: name,
          ip: addr.address,
          url: `http://${addr.address}:${PORT}`
        });
      }
    }
  }
  res.json({
    port: PORT,
    hostname: os.hostname(),
    addresses,
    primary_ip: addresses.length > 0 ? addresses[0].ip : '127.0.0.1',
    primary_url: addresses.length > 0 ? addresses[0].url : `http://localhost:${PORT}`,
    localhost_url: `http://localhost:${PORT}`
  });
});

// User Account Login or Sign Up (Generates USR-XXXX code)
app.post('/api/auth/login', (req, res) => {
  const { name, email, avatarColor, avatarUrl } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const user = db.createOrGetUser(name, email, avatarColor, avatarUrl);
    res.json({ success: true, user });
  } catch (err) {
    console.error('[!] Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lookup user by user_code
app.get('/api/user/:code', (req, res) => {
  try {
    const user = db.getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google Classroom style: Get all boards a user is enrolled in
app.get('/api/user/:code/rooms', (req, res) => {
  try {
    const rooms = db.getUserEnrolledRooms(req.params.code);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List public rooms
app.get('/api/rooms', (req, res) => {
  try {
    const rooms = db.listPublicRooms();
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Room
app.post('/api/rooms/create', (req, res) => {
  const { title, hostUserCode, hostName, isPublic, password } = req.body;
  if (!title || !hostUserCode) {
    return res.status(400).json({ error: 'Title and host user code are required' });
  }
  try {
    // Generate 4-letter uppercase room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    while (true) {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!db.getRoom(code)) break;
    }

    const room = db.createRoom(code, title, hostUserCode, hostName || 'Host', isPublic !== false, password);
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get room details & full state snapshot
app.get('/api/rooms/:code', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const room = db.getRoom(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const members = db.getRoomMembers(code);
    const actions = db.getRoomActions(code);
    const chat = db.getChatHistory(code);
    const milestones = db.getRoomMilestones(code);
    const publicWorks = db.getPublicWorks(code);

    res.json({
      success: true,
      room,
      members,
      actions,
      chat,
      milestones,
      public_works: publicWorks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STATIC FRONTEND SERVING ──────────────────────────────────────────
// In production, Express serves the Vite built assets directly
const CLIENT_DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── WEBSOCKET REAL-TIME BROADCAST ENGINE ─────────────────────────────

function broadcastToRoom(roomCode, msg, excludeWs = null) {
  const cleanRoom = roomCode.trim().toUpperCase();
  const socketMap = roomSockets.get(cleanRoom);
  if (!socketMap) return;

  const data = JSON.stringify(msg);
  for (const [, wsSet] of socketMap.entries()) {
    for (const ws of wsSet) {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}

function sendToUser(userCode, msg) {
  const cleanUser = userCode.trim().toUpperCase();
  const wsSet = userSockets.get(cleanUser);
  if (!wsSet) return false;

  const data = JSON.stringify(msg);
  let sent = false;
  for (const ws of wsSet) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      sent = true;
    }
  }
  return sent;
}

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  wsMeta.set(ws, {
    user_code: null,
    user_name: 'Guest',
    room_code: null,
    avatar_color: '#0284c7',
    ip: clientIp
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleWsMessage(ws, msg);
    } catch (e) {
      console.error('[!] Malformed WebSocket frame:', e);
    }
  });

  ws.on('close', () => {
    handleWsDisconnect(ws);
  });
});

function handleWsMessage(ws, msg) {
  const meta = wsMeta.get(ws) || {};
  const type = msg.type;

  switch (type) {
    // 1. Identify client with User Code
    case 'identify': {
      const userCode = msg.user_code?.trim().toUpperCase();
      if (!userCode) return;

      meta.user_code = userCode;
      meta.user_name = msg.user_name || 'User';
      meta.avatar_color = msg.avatar_color || '#0284c7';

      if (!userSockets.has(userCode)) {
        userSockets.set(userCode, new Set());
      }
      userSockets.get(userCode).add(ws);

      ws.send(JSON.stringify({
        type: 'identified_ack',
        user_code: userCode,
        ip: meta.ip
      }));
      break;
    }

    // 2. Join a Whiteboard Room
    case 'join_room': {
      const roomCode = msg.room_code?.trim().toUpperCase();
      const userCode = msg.user_code?.trim().toUpperCase();
      const userName = msg.user_name?.trim() || 'User';

      if (!roomCode || !userCode) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Room code and user code required' }));
      }

      const room = db.getRoom(roomCode);
      if (!room) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Room does not exist' }));
      }

      const isHost = room.host_user_code === userCode;
      const isLocked = Boolean(room.locked);

      // Check member permissions
      let members = db.getRoomMembers(roomCode);
      let myMember = members.find(m => m.user_code === userCode);

      if (isLocked && !isHost && !myMember) {
        return ws.send(JSON.stringify({ type: 'error', text: 'This room is locked by the host' }));
      }

      if (!myMember) {
        const initialCanDraw = room.presentation_mode ? 0 : 1;
        db.addRoomMember(roomCode, userCode, userName, isHost ? 'host' : 'member', initialCanDraw);
        members = db.getRoomMembers(roomCode);
        myMember = members.find(m => m.user_code === userCode);
      }

      // Detach from previous room if any
      if (meta.room_code && meta.room_code !== roomCode) {
        leaveCurrentRoom(ws);
      }

      meta.room_code = roomCode;
      meta.user_code = userCode;
      meta.user_name = userName;
      meta.avatar_color = msg.avatar_color || myMember?.avatar_color || '#0284c7';

      // Attach to room sockets map
      if (!roomSockets.has(roomCode)) {
        roomSockets.set(roomCode, new Map());
      }
      const roomMap = roomSockets.get(roomCode);
      if (!roomMap.has(userCode)) {
        roomMap.set(userCode, new Set());
      }
      roomMap.get(userCode).add(ws);

      // Fetch snapshot data
      const actions = db.getRoomActions(roomCode);
      const chat = db.getChatHistory(roomCode);
      const milestones = db.getRoomMilestones(roomCode);
      const publicWorks = db.getPublicWorks(roomCode);

      // Send join acknowledgment & state snapshot
      ws.send(JSON.stringify({
        type: 'join_ack',
        room,
        is_host: isHost,
        my_permissions: computeUserPermissions(room, myMember, isHost),
        members: getOnlineStatusMembers(roomCode, members, room),
        actions,
        chat,
        milestones,
        public_works: publicWorks
      }));

      // Record & broadcast user_joined notice
      const joinSysMsg = {
        id: `sys_join_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        room_code: roomCode,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#10b981',
        message: `👋 ${userName} joined the room.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(roomCode, joinSysMsg);
      broadcastToRoom(roomCode, { type: 'chat_message', ...joinSysMsg });

      broadcastToRoom(roomCode, {
        type: 'user_joined',
        user_code: userCode,
        user_name: userName,
        avatar_color: meta.avatar_color,
        members: getOnlineStatusMembers(roomCode, members)
      }, ws);

      break;
    }

    // 3. Real-time Drawing Stroke Points (High frequency streaming)
    case 'stroke_pts': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_draw) {
        return; // Drawing blocked by host policy
      }

      broadcastToRoom(meta.room_code, {
        type: 'stroke_pts',
        id: msg.id,
        points: msg.points,
        color: msg.color,
        width: msg.width,
        brush: msg.brush,
        opacity: msg.opacity,
        user_code: meta.user_code,
        user_name: meta.user_name
      }, ws);
      break;
    }

    // 4. Whiteboard Action Commit (Strokes, Shapes, Text, Sticky, Table, Eraser)
    case 'action': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_draw) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Drawing is currently disabled for you by the host.'
        }));
      }

      const action = msg.action;
      if (!action || !action.id) return;

      if (action.kind === 'table_edit') {
        const existingActions = db.getRoomActions(meta.room_code);
        const targetTable = existingActions.find(a => a.id === action.target);
        if (targetTable) {
          if (!targetTable.cells) targetTable.cells = {};
          targetTable.cells[`${action.r},${action.c}`] = action.text;
          db.saveAction(meta.room_code, targetTable);
          broadcastToRoom(meta.room_code, {
            type: 'action',
            action: targetTable
          }, ws);
          break;
        }
      }

      action.user_code = meta.user_code;
      action.user_name = meta.user_name;
      action.seq = db.getNextSeq(meta.room_code);

      db.saveAction(meta.room_code, action);

      broadcastToRoom(meta.room_code, {
        type: 'action',
        action
      }, ws);
      break;
    }

    // 5. Undo / Redo
    case 'undo':
    case 'redo': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_draw) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Drawing actions are disabled for you by the host.'
        }));
      }

      const actionId = msg.target;
      const isUndo = type === 'undo';

      db.updateActionUndone(actionId, isUndo);

      broadcastToRoom(meta.room_code, {
        type,
        target: actionId,
        user_code: meta.user_code,
        user_name: meta.user_name
      });
      break;
    }

    // 6. Clear Canvas
    case 'clear_canvas': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      if (room && room.host_user_code !== meta.user_code) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Only the host can clear the whiteboard canvas' }));
      }

      const actions = db.getRoomActions(meta.room_code);
      for (const a of actions) {
        db.updateActionUndone(a.id, true);
      }

      broadcastToRoom(meta.room_code, {
        type: 'canvas_cleared',
        user_name: meta.user_name
      });
      break;
    }

    // 7. Real-Time Remote Cursors
    case 'cursor': {
      if (!meta.room_code) return;
      broadcastToRoom(meta.room_code, {
        type: 'cursor',
        user_code: meta.user_code,
        user_name: meta.user_name,
        avatar_color: meta.avatar_color,
        x: msg.x,
        y: msg.y
      }, ws);
      break;
    }

    // 8. Chat Message
    case 'chat_message': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_chat) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Chat messaging is disabled for you by the host.'
        }));
      }

      const text = msg.message?.trim();
      if (!text) return;

      const chatEntry = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        room_code: meta.room_code,
        sender_code: meta.user_code,
        sender_name: meta.user_name,
        avatar_color: meta.avatar_color,
        message: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: false
      };

      db.saveChatMessage(meta.room_code, chatEntry);
      broadcastToRoom(meta.room_code, {
        type: 'chat_message',
        ...chatEntry
      });
      break;
    }

    // 9. Clear Chat
    case 'clear_chat': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      if (room && room.host_user_code !== meta.user_code) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Only the host can clear chat history' }));
      }
      db.clearRoomChat(meta.room_code);
      broadcastToRoom(meta.room_code, {
        type: 'chat_cleared',
        user_name: meta.user_name
      });
      break;
    }

    // 10. Save Canvas Milestone / Instance
    case 'save_milestone': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_instances) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Managing instances is disabled for you by the host.'
        }));
      }

      const milestone = {
        id: `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: msg.title || 'Saved Milestone',
        author_code: meta.user_code,
        author_name: meta.user_name,
        snapshot: msg.snapshot || db.getRoomActions(meta.room_code),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      db.saveMilestone(meta.room_code, milestone);

      broadcastToRoom(meta.room_code, {
        type: 'new_milestone',
        milestone
      });

      // Post system announcement
      const sysNotice = {
        id: `sys_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#2563eb',
        message: `📸 ${meta.user_name} saved instance: '${milestone.title}'`,
        timestamp: milestone.timestamp,
        is_system: true
      };
      db.saveChatMessage(meta.room_code, sysNotice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });
      break;
    }

    // 11. Restore Canvas Milestone (Host / Co-host restricted)
    case 'restore_milestone': {
      if (!meta.room_code) return;
      const { isHost, me, perms } = getMemberPermissions(meta.room_code, meta.user_code);

      if (!isHost && me?.role !== 'cohost' && !perms.can_instances) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Restricted: Only the host or an assigned co-host can restore canvas instances.'
        }));
      }

      const actions = msg.actions || [];
      for (const a of actions) {
        a.seq = db.getNextSeq(meta.room_code);
        db.saveAction(meta.room_code, a);
      }

      broadcastToRoom(meta.room_code, {
        type: 'snapshot_restored',
        actions: db.getRoomActions(meta.room_code),
        title: msg.title || 'Restored Milestone',
        restored_by: meta.user_name
      });

      const sysNotice = {
        id: `sys_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#2563eb',
        message: `🔄 Canvas restored to milestone '${msg.title}' by ${meta.user_name}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(meta.room_code, sysNotice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });
      break;
    }

    // Top-Level Matrix Permissions
    case 'update_matrix_permissions': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code === meta.user_code;
      if (!isHost) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Unauthorized: Host action only' }));
      }

      db.updateRoomPermissions(meta.room_code, msg.permissions || {});
      if (msg.permissions?.canva_perm === 'host_only') {
        db.setAllMembersDrawingPermission(meta.room_code, 0);
      } else if (msg.permissions?.canva_perm === 'everyone') {
        db.setAllMembersDrawingPermission(meta.room_code, 1);
      }

      const notice = {
        id: `sys_perm_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#3b82f6',
        message: `⚙️ Host ${meta.user_name} updated room permission policies.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(meta.room_code, notice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...notice });

      broadcastUpdatedRoomAndPermissions(meta.room_code);
      break;
    }

    // Top-Level Individual Member Permission Toggle
    case 'update_member_permission': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code === meta.user_code;
      if (!isHost) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Unauthorized: Host action only' }));
      }

      if (msg.target_user_code) {
        db.updateMemberCustomPermissions(meta.room_code, msg.target_user_code, msg.permissions || {});
      }

      broadcastUpdatedRoomAndPermissions(meta.room_code);
      break;
    }

    // 12. Host Controls & Permissions
    case 'host_control': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code === meta.user_code;
      if (!isHost) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Unauthorized: Host action only' }));
      }

      const action = msg.action;
      const targetUserCode = msg.target_user_code;

      if (action === 'block_all') {
        db.setAllMembersDrawingPermission(meta.room_code, 0);
        db.updateRoomPermissions(meta.room_code, { canva_perm: 'host_only' });
        const notice = {
          id: `sys_perm_${Date.now()}`,
          room_code: meta.room_code,
          sender_code: 'system',
          sender_name: 'System',
          avatar_color: '#ef4444',
          message: `🔒 Host ${meta.user_name} paused drawing permissions for all members.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          is_system: true
        };
        db.saveChatMessage(meta.room_code, notice);
        broadcastToRoom(meta.room_code, { type: 'chat_message', ...notice });
      } else if (action === 'allow_all') {
        db.setAllMembersDrawingPermission(meta.room_code, 1);
        db.updateRoomPermissions(meta.room_code, { canva_perm: 'everyone' });
        const notice = {
          id: `sys_perm_${Date.now()}`,
          room_code: meta.room_code,
          sender_code: 'system',
          sender_name: 'System',
          avatar_color: '#10b981',
          message: `🔓 Host ${meta.user_name} enabled drawing permissions for all members.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          is_system: true
        };
        db.saveChatMessage(meta.room_code, notice);
        broadcastToRoom(meta.room_code, { type: 'chat_message', ...notice });
      } else if (action === 'toggle_draw') {
        const canDraw = msg.can_draw !== undefined ? msg.can_draw : 1;
        db.updateMemberPermission(meta.room_code, targetUserCode, canDraw);
      } else if (action === 'promote_cohost') {
        const isCohost = Boolean(msg.is_cohost);
        db.updateMemberPermission(meta.room_code, targetUserCode, 1, isCohost);
      } else if (action === 'kick') {
        db.removeRoomMember(meta.room_code, targetUserCode);
        sendToUser(targetUserCode, {
          type: 'kicked',
          room_code: meta.room_code,
          text: 'You were removed from this room by the host'
        });
      } else if (action === 'lock_room') {
        db.updateRoomSettings(meta.room_code, { locked: msg.locked });
      } else if (action === 'presentation_mode') {
        db.updateRoomSettings(meta.room_code, { presentation_mode: msg.presentation_mode });
      } else if (action === 'update_matrix_permissions') {
        db.updateRoomPermissions(meta.room_code, msg.permissions || {});
        if (msg.permissions?.canva_perm === 'host_only') {
          db.setAllMembersDrawingPermission(meta.room_code, 0);
        } else if (msg.permissions?.canva_perm === 'everyone') {
          db.setAllMembersDrawingPermission(meta.room_code, 1);
        }
      } else if (action === 'update_member_permission') {
        db.updateMemberCustomPermissions(meta.room_code, targetUserCode, msg.permissions || {});
      }

      broadcastUpdatedRoomAndPermissions(meta.room_code);
      break;
    }

    // 13. HOST ADDS MEMBER BY AUTO-GENERATED USER CODE OR EMAIL OR IP
    case 'add_member': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code === meta.user_code;
      const members = db.getRoomMembers(meta.room_code);
      const me = members.find(m => m.user_code === meta.user_code);

      if (!isHost && me?.role !== 'cohost') {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Only the host or co-host can add members to this session.'
        }));
      }

      const rawTarget = msg.target?.trim();
      if (!rawTarget) {
        return ws.send(JSON.stringify({ type: 'error', text: 'User code or email is required' }));
      }

      // Search database for target user
      let targetUser = null;
      if (rawTarget.toUpperCase().startsWith('USR-')) {
        targetUser = db.getUserByCode(rawTarget);
      } else if (rawTarget.includes('@')) {
        targetUser = db.getUserByEmail(rawTarget);
      } else {
        targetUser = db.getUserByCode(`USR-${rawTarget.toUpperCase()}`) || db.getUserByCode(rawTarget);
      }

      // If not found in DB, check active WebSocket metadata by IP or name
      if (!targetUser) {
        for (const [code, wsSet] of userSockets.entries()) {
          for (const s of wsSet) {
            const m = wsMeta.get(s);
            if (m && (m.ip === rawTarget || m.user_name.toLowerCase() === rawTarget.toLowerCase())) {
              targetUser = db.getUserByCode(code);
              break;
            }
          }
          if (targetUser) break;
        }
      }

      if (!targetUser) {
        return ws.send(JSON.stringify({
          type: 'notice',
          text: `User '${rawTarget}' not found. Please verify the 8-character Account Code (e.g. USR-XXXX).`
        }));
      }

      // Enroll in room_members
      db.addRoomMember(meta.room_code, targetUser.user_code, targetUser.name, 'member', 1);

      // System chat announcement
      const sysNotice = {
        id: `sys_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#2563eb',
        message: `➕ ${targetUser.name} (${targetUser.user_code}) was added to the whiteboard by ${meta.user_name}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(meta.room_code, sysNotice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });

      const updatedMembers = db.getRoomMembers(meta.room_code);
      broadcastToRoom(meta.room_code, {
        type: 'members_updated',
        members: getOnlineStatusMembers(meta.room_code, updatedMembers)
      });

      // Send real-time push invite to the added user if they are online
      const invitePushed = sendToUser(targetUser.user_code, {
        type: 'room_invite',
        room_code: meta.room_code,
        room_title: room.title,
        host_name: meta.user_name,
        host_code: meta.user_code
      });

      ws.send(JSON.stringify({
        type: 'notice',
        text: `Successfully added ${targetUser.name} (${targetUser.user_code})! ${invitePushed ? 'Real-time invitation delivered.' : 'Enrolled in their Classroom dashboard.'}`
      }));

      break;
    }

    // 14. List Active Connected Users for Quick Pick
    case 'list_connected_users': {
      const activeList = [];
      const seenCodes = new Set();

      for (const [code, wsSet] of userSockets.entries()) {
        if (code === meta.user_code || seenCodes.has(code)) continue;
        for (const s of wsSet) {
          if (s.readyState === WebSocket.OPEN) {
            const m = wsMeta.get(s);
            activeList.push({
              user_code: code,
              name: m.user_name,
              ip: m.ip,
              in_room: m.room_code
            });
            seenCodes.add(code);
            break;
          }
        }
      }
      ws.send(JSON.stringify({
        type: 'connected_users_list',
        users: activeList
      }));
      break;
    }

    // 15. Share Whiteboard Session Bundle with a Member
    case 'share_session_bundle': {
      const targetUserCode = msg.target_user_code;
      if (!targetUserCode) return;
      const bundle = msg.bundle;
      const delivered = sendToUser(targetUserCode, {
        type: 'received_session_bundle',
        sender_code: meta.user_code,
        sender_name: meta.user_name,
        room_code: meta.room_code,
        bundle
      });
      if (delivered) {
        ws.send(JSON.stringify({
          type: 'notice',
          text: `Whiteboard session bundle sent to member!`
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'notice',
          text: `User is currently not online to receive live push. You can export as a .whiteboard file to send directly!`
        }));
      }
      break;
    }

    // 16. Save Public Work Screenshot
    case 'save_public_work': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code === meta.user_code;
      const members = db.getRoomMembers(meta.room_code);
      const me = members.find(m => m.user_code === meta.user_code);
      const perms = computeUserPermissions(room, me, isHost);

      if (!perms.can_public_work) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Sharing to public works is currently restricted by the host.'
        }));
      }

      const work = {
        id: `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: msg.title || 'Canvas Snapshot',
        author_code: meta.user_code,
        author_name: meta.user_name,
        image_data: msg.image_data,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      db.savePublicWork(meta.room_code, work);
      broadcastToRoom(meta.room_code, {
        type: 'new_public_work',
        work
      });

      const sysNotice = {
        id: `sys_pw_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#8b5cf6',
        message: `🖼️ ${meta.user_name} published screenshot '${work.title}' to Public Works.`,
        timestamp: work.timestamp,
        is_system: true
      };
      db.saveChatMessage(meta.room_code, sysNotice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });
      break;
    }

    // 17. Delete Public Work Screenshot
    case 'delete_public_work': {
      if (!meta.room_code) return;
      db.deletePublicWork(msg.id);
      broadcastToRoom(meta.room_code, {
        type: 'public_work_deleted',
        id: msg.id
      });
      break;
    }

    // 18. Update Instance Snapshot (Work in Instance Sandbox)
    case 'update_instance_snapshot': {
      if (!meta.room_code) return;
      db.updateMilestoneSnapshot(msg.instance_id, msg.snapshot);
      broadcastToRoom(meta.room_code, {
        type: 'instance_snapshot_updated',
        instance_id: msg.instance_id,
        snapshot: msg.snapshot
      });
      break;
    }

    // 19. Broadcast Instance Show Mode to All Members
    case 'broadcast_instance_show': {
      if (!meta.room_code) return;
      broadcastToRoom(meta.room_code, {
        type: 'show_instance_broadcast',
        instance_id: msg.instance_id,
        title: msg.title,
        snapshot: msg.snapshot,
        broadcaster_name: meta.user_name
      });
      break;
    }
  }
}

function computeUserPermissions(room, member, isHost) {
  if (isHost || member?.role === 'cohost') {
    return {
      can_draw: true,
      can_chat: true,
      can_instances: true,
      can_public_work: true,
      role: isHost ? 'host' : 'cohost'
    };
  }

  const canvaPerm = room?.canva_perm || 'everyone';
  const chatPerm = room?.chat_perm || room?.chat_permission || 'everyone';
  const instancesPerm = room?.instances_perm || 'everyone';
  const publicWorkPerm = room?.public_work_perm || 'everyone';

  const memberCanDraw = member ? Boolean(member.can_draw !== 0 && member.can_draw !== false) : true;
  const memberCanChat = member ? Boolean(member.can_chat !== 0 && member.can_chat !== false) : true;
  const memberCanInstances = member ? Boolean(member.can_instances !== 0 && member.can_instances !== false) : true;
  const memberCanPublicWork = member ? Boolean(member.can_public_work !== 0 && member.can_public_work !== false) : true;

  return {
    can_draw: canvaPerm === 'everyone' ? true : (canvaPerm === 'host_only' ? false : memberCanDraw),
    can_chat: chatPerm === 'everyone' ? true : (chatPerm === 'host_only' ? false : memberCanChat),
    can_instances: instancesPerm === 'everyone' ? true : (instancesPerm === 'host_only' ? false : memberCanInstances),
    can_public_work: publicWorkPerm === 'everyone' ? true : (publicWorkPerm === 'host_only' ? false : memberCanPublicWork),
    role: member?.role || 'member'
  };
}

function getMemberPermissions(roomCode, userCode) {
  const room = db.getRoom(roomCode);
  const isHost = room?.host_user_code === userCode;
  const members = db.getRoomMembers(roomCode);
  const me = members.find(m => m.user_code === userCode);
  return {
    isHost,
    room,
    me,
    perms: computeUserPermissions(room, me, isHost)
  };
}

function broadcastUpdatedRoomAndPermissions(roomCode) {
  const updatedMembers = db.getRoomMembers(roomCode);
  const updatedRoom = db.getRoom(roomCode);
  const onlineMembers = getOnlineStatusMembers(roomCode, updatedMembers, updatedRoom);

  // 1. Broadcast global update
  broadcastToRoom(roomCode, {
    type: 'room_settings_updated',
    room: updatedRoom,
    members: onlineMembers
  });

  // 2. Deliver individualized computed permissions to each connected client
  const roomMap = roomSockets.get(roomCode);
  if (roomMap) {
    for (const [uCode, wsSet] of roomMap.entries()) {
      const isH = updatedRoom?.host_user_code === uCode;
      const uMem = updatedMembers.find(m => m.user_code === uCode);
      const computed = computeUserPermissions(updatedRoom, uMem, isH);
      for (const s of wsSet) {
        if (s.readyState === WebSocket.OPEN) {
          s.send(JSON.stringify({
            type: 'permissions_updated',
            my_permissions: computed,
            room: updatedRoom,
            members: onlineMembers
          }));
        }
      }
    }
  }
}

function getOnlineStatusMembers(roomCode, members, room) {
  const roomMap = roomSockets.get(roomCode);
  const theRoom = room || db.getRoom(roomCode);
  return members.map(m => {
    const isOnline = Boolean(roomMap && roomMap.has(m.user_code) && roomMap.get(m.user_code).size > 0);
    const isHost = theRoom?.host_user_code === m.user_code;
    const perms = computeUserPermissions(theRoom, m, isHost);
    return {
      ...m,
      online: isOnline,
      ...perms,
      raw_can_draw: Boolean(m.can_draw !== 0),
      raw_can_chat: Boolean(m.can_chat !== 0),
      raw_can_instances: Boolean(m.can_instances !== 0),
      raw_can_public_work: Boolean(m.can_public_work !== 0)
    };
  });
}

function leaveCurrentRoom(ws) {
  const meta = wsMeta.get(ws);
  if (!meta || !meta.room_code) return;

  const roomCode = meta.room_code;
  const userCode = meta.user_code;

  const roomMap = roomSockets.get(roomCode);
  if (roomMap && roomMap.has(userCode)) {
    const wsSet = roomMap.get(userCode);
    wsSet.delete(ws);
    if (wsSet.size === 0) {
      roomMap.delete(userCode);
      const members = db.getRoomMembers(roomCode);

      // Record in permanent chat log and broadcast
      const leaveSysMsg = {
        id: `sys_left_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        room_code: roomCode,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#ef4444',
        message: `🚪 ${meta.user_name || 'A user'} left the room.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(roomCode, leaveSysMsg);
      broadcastToRoom(roomCode, { type: 'chat_message', ...leaveSysMsg });

      broadcastToRoom(roomCode, {
        type: 'user_left',
        user_code: userCode,
        user_name: meta.user_name,
        message: `${meta.user_name || 'A user'} left the room`,
        members: getOnlineStatusMembers(roomCode, members)
      });
    }
  }
  meta.room_code = null;
}

function handleWsDisconnect(ws) {
  const meta = wsMeta.get(ws);
  if (!meta) return;

  leaveCurrentRoom(ws);

  if (meta.user_code && userSockets.has(meta.user_code)) {
    const userSet = userSockets.get(meta.user_code);
    userSet.delete(ws);
    if (userSet.size === 0) {
      userSockets.delete(meta.user_code);
    }
  }
}

// Serve production client build statically for zero-internet / standalone app execution
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Collaborative Whiteboard Server Running on Port ${PORT}`);
  console.log(`📡 Local Access:       http://localhost:${PORT}`);
  console.log(`🌐 Cross-Network:      Accessible via Wi-Fi, Hotspot, and Cloud`);
  console.log(`💾 SQLite Database:    server/data/whiteboard_data.db`);
  console.log(`======================================================\n`);
});


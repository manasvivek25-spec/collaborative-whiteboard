"""
LAN Whiteboard SERVER  (Full Protocol v2 - Fixed & Optimized)
--------------------------------------------------------------
Protocol: one JSON object per line (newline-delimited JSON) over TCP.

Supports: create/join, stroke_pts, action (shape/text/fill/move/delete/
clear/table/image/sticky), undo/redo, cursor, chat, ping/pong,
save/list_saves/load, resend/resume, leave, list_rooms,
host_control, raise_hand, reaction. Auto-saves periodically.
Public / private rooms. RBAC.
"""

import copy
import json
import os
import random
import re
import socket
import sqlite3
import string
import threading
import time
import uuid

HOST = "0.0.0.0"
PORT = 5050
DISCOVERY_PORT = 5052
SAVES_DIR = "saves"
COLORS = [
    "#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8338ec",
    "#fb5607", "#06a77d", "#d62828", "#3a86ff", "#ff006e",
]

os.makedirs(SAVES_DIR, exist_ok=True)


# ── SQLite Chat Database ──────────────────────────────────────────────
class ChatDB:
    """Thread-safe SQLite persistent storage for room chat history."""

    def __init__(self, db_path):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        with self._lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS chat_messages (
                            message_id TEXT PRIMARY KEY,
                            room_id TEXT NOT NULL,
                            sender_id TEXT NOT NULL,
                            sender_name TEXT NOT NULL,
                            sender_avatar_color TEXT,
                            message TEXT NOT NULL,
                            timestamp TEXT NOT NULL,
                            seq INTEGER NOT NULL,
                            created_at REAL NOT NULL
                        )
                    """)
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_room_seq ON chat_messages(room_id, seq)")
                    conn.commit()
            except Exception as e:
                print(f"[!] SQLite _init_db error: {e}")

    def save_message(self, entry, seq):
        with self._lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute("""
                        INSERT OR IGNORE INTO chat_messages
                        (message_id, room_id, sender_id, sender_name, sender_avatar_color, message, timestamp, seq, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        str(entry.get("message_id", "")),
                        str(entry.get("room_id", "")).strip().upper(),
                        str(entry.get("sender_id", "")),
                        str(entry.get("sender_name", "")),
                        str(entry.get("sender_avatar_color", "#0284c7")),
                        str(entry.get("text", entry.get("message", ""))),
                        str(entry.get("time", entry.get("timestamp", ""))),
                        int(seq or 0),
                        time.time()
                    ))
                    conn.commit()
            except Exception as e:
                print(f"[!] SQLite save_message error: {e}")

    def load_room_history(self, room_id):
        with self._lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    cur = conn.cursor()
                    cur.execute("""
                        SELECT message_id, room_id, sender_id, sender_name, sender_avatar_color, message, timestamp, seq
                        FROM chat_messages
                        WHERE room_id = ?
                        ORDER BY seq ASC, created_at ASC
                    """, (str(room_id).strip().upper(),))
                    rows = cur.fetchall()
                    out = []
                    for r in rows:
                        out.append({
                            "message_id": r["message_id"],
                            "room_id": r["room_id"],
                            "sender_id": r["sender_id"],
                            "sender_name": r["sender_name"],
                            "sender_avatar_color": r["sender_avatar_color"],
                            "message": r["message"],
                            "text": r["message"],
                            "user": r["sender_name"],
                            "time": r["timestamp"],
                            "timestamp": r["timestamp"],
                            "seq": r["seq"],
                            "is_system": False,
                        })
                    return out
            except Exception as e:
                print(f"[!] SQLite load_room_history error: {e}")
                return []

    def clear_room(self, room_id):
        with self._lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute("DELETE FROM chat_messages WHERE room_id = ?", (str(room_id).strip().upper(),))
                    conn.commit()
            except Exception as e:
                print(f"[!] SQLite clear_room error: {e}")


chat_db = ChatDB(os.path.join(SAVES_DIR, "chat_history.db"))


# ── helpers ───────────────────────────────────────────────────────────
def _token():
    return "".join(random.choices(string.ascii_letters + string.digits, k=32))


def _code():
    while True:
        c = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if c not in sessions:
            return c


def _ts():
    return time.strftime("%H:%M")


# ── ClientConn ────────────────────────────────────────────────────────
class ClientConn:
    """One connected client socket."""

    def __init__(self, sock, addr):
        self.sock = sock
        self.addr = addr
        self.name = None
        self.color = None
        self.session = None
        self.token = None
        self.avatar_color = "#2a9d8f"
        self._lock = threading.Lock()

    def send(self, msg):
        try:
            data = (json.dumps(msg, default=str) + "\n").encode("utf-8")
            with self._lock:
                self.sock.sendall(data)
        except OSError:
            pass

    def close(self):
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ── Session ───────────────────────────────────────────────────────────
class Session:
    """One whiteboard room."""

    def __init__(self, code, host_name, public=False, password=None, title=None):
        self.code = code
        self.title = title or f"Room {code}"
        self.host = host_name
        self.public = bool(public)
        self.password = password or None
        self.locked = False
        self.presentation_mode = False
        self.chat_permission = "everyone"   # "everyone", "host_only", "no_one"

        self.clients = {}            # name -> ClientConn
        self.tokens = {}             # name -> token  (survives disconnect)
        self.permissions = {}        # name -> {can_draw, is_cohost}
        self.avatar_colors = {}      # name -> hex color

        # Fresh empty action log - starts completely clean without any markings
        self.actions = []
        self.by_id = {}
        self.seq = 0                            # last seq issued
        self.history = []                       # [(seq, msg)] for resend / resume

        self.session_works = []                 # list of saved instance dicts
        self.instance_save_perm = "everyone"    # "everyone", "host_only", "selected"
        self.instance_save_allowed = {host_name}# set of allowed users when "selected"

        self.chat_log = chat_db.load_room_history(code)
        self.seen_message_ids = {m["message_id"] for m in self.chat_log if "message_id" in m}
        self.hands_raised = set()
        self.preauthorized_ips = set()
        self.preauthorized_users = set()
        self.lock = threading.Lock()
        self._last_autosave = 0.0

    # ── seq / broadcast ─────────────────────────────────────────────
    def _next(self):
        self.seq += 1
        return self.seq

    def broadcast(self, msg, *, exclude=None):
        for n, c in list(self.clients.items()):
            if n != exclude:
                c.send(msg)

    def seq_broadcast(self, msg, *, exclude=None):
        """Assign seq, record in history, broadcast."""
        s = self._next()
        msg["seq"] = s
        self.history.append((s, msg))
        if len(self.history) > 12000:
            self.history = self.history[-6000:]
        self.broadcast(msg, exclude=exclude)

    # ── permissions ─────────────────────────────────────────────────
    def can_draw(self, name):
        if name == self.host:
            return True
        p = self.permissions.get(name, {})
        if self.presentation_mode and not p.get("is_cohost"):
            return False
        return p.get("can_draw", True)

    def can_save_instance(self, name):
        if name == self.host:
            return True
        if self.permissions.get(name, {}).get("is_cohost"):
            return True
        if self.instance_save_perm == "everyone":
            return True
        if self.instance_save_perm == "selected":
            return name in self.instance_save_allowed
        return False

    def users_info(self):
        out = []
        seen = set()
        for n, c in self.clients.items():
            seen.add(n)
            p = self.permissions.get(n, {})
            out.append({
                "name": n,
                "color": c.color,
                "avatar_color": self.avatar_colors.get(n, c.color),
                "is_host": n == self.host,
                "is_cohost": p.get("is_cohost", False),
                "can_draw": self.can_draw(n),
                "can_save_instance": self.can_save_instance(n),
                "hand_raised": n in self.hands_raised,
                "online": True,
                "ip": c.addr[0] if getattr(c, "addr", None) else "",
            })
        for n in self.tokens:
            if n not in seen:
                p = self.permissions.get(n, {})
                col = self.avatar_colors.get(n, "#64748b")
                out.append({
                    "name": n,
                    "color": col,
                    "avatar_color": col,
                    "is_host": n == self.host,
                    "is_cohost": p.get("is_cohost", False),
                    "can_draw": p.get("can_draw", True),
                    "can_save_instance": self.can_save_instance(n),
                    "hand_raised": False,
                    "online": False,
                    "ip": "",
                })
        return out

    # ── persistence ─────────────────────────────────────────────────
    def autosave(self, force=False):
        now = time.time()
        if not force and (now - self._last_autosave < 2.0):
            return
        self._last_autosave = now
        try:
            d = {
                "code": self.code,
                "title": getattr(self, "title", f"Room {self.code}"),
                "host": self.host,
                "actions": self.actions,
                "chat": self.chat_log,
                "seq": self.seq,
                "session_works": self.session_works,
                "instance_save_perm": self.instance_save_perm,
                "instance_save_allowed": list(self.instance_save_allowed),
                "permissions": self.permissions,
                "members": list(self.tokens.keys()),
                "avatar_colors": self.avatar_colors,
                "presentation_mode": self.presentation_mode,
                "locked": self.locked,
                "preauth_ips": list(getattr(self, "preauthorized_ips", [])),
                "preauth_users": list(getattr(self, "preauthorized_users", [])),
            }
            with open(os.path.join(SAVES_DIR, f"autosave_{self.code}.json"), "w", encoding="utf-8") as f:
                json.dump(d, f)
        except OSError:
            pass

    def save_named(self, name):
        safe = "".join(c for c in name if c.isalnum() or c in "-_")[:40] or "board"
        d = {"code": self.code, "title": getattr(self, "title", f"Room {self.code}"),
             "host": self.host, "actions": self.actions, "chat": self.chat_log,
             "seq": self.seq, "session_works": self.session_works,
             "instance_save_perm": self.instance_save_perm,
             "instance_save_allowed": list(self.instance_save_allowed)}
        path = os.path.join(SAVES_DIR, f"{safe}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f)
        return safe

    def load_named(self, name):
        safe = "".join(c for c in name if c.isalnum() or c in "-_")[:40]
        path = os.path.join(SAVES_DIR, f"{safe}.json")
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def list_saved():
        out = []
        for fn in os.listdir(SAVES_DIR):
            if fn.endswith(".json") and not fn.startswith("autosave_"):
                out.append(fn[:-5])
        return sorted(out)


def _restore_session_from_disk(code):
    """Restores a session and its complete workspace from persistent storage if available."""
    path = os.path.join(SAVES_DIR, f"autosave_{code}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        s = Session(code, data.get("host", "Host"), public=True, title=data.get("title"))
        s.actions = [dict(a) for a in data.get("actions", []) if isinstance(a, dict)]
        s.by_id = {a["id"]: a for a in s.actions if "id" in a}
        s.session_works = data.get("session_works", [])
        s.instance_save_perm = data.get("instance_save_perm", "everyone")
        s.instance_save_allowed = set(data.get("instance_save_allowed", [s.host]))
        s.permissions = data.get("permissions", {})
        s.avatar_colors = data.get("avatar_colors", {})
        s.presentation_mode = data.get("presentation_mode", False)
        s.locked = data.get("locked", False)
        s.preauthorized_ips = set(data.get("preauth_ips", []))
        s.preauthorized_users = set(data.get("preauth_users", []))
        for m in data.get("members", []):
            s.tokens.setdefault(m, f"tok_{m}")
        s.seq = int(data.get("seq", len(s.actions)))
        return s
    except Exception as e:
        print(f"[!] Error loading autosave for {code}: {e}")
        return None


# ── global state ──────────────────────────────────────────────────────
sessions = {}                        # code -> Session
sessions_lock = threading.Lock()
all_clients = set()                  # set of all active ClientConn
all_clients_lock = threading.Lock()


# ── handlers ──────────────────────────────────────────────────────────

def h_list_rooms(conn, _msg):
    with sessions_lock:
        rooms = []
        for code, s in sessions.items():
            with s.lock:
                if s.public and not s.locked:
                    rooms.append({"code": code, "host": s.host,
                                  "title": getattr(s, "title", f"Room {code}"),
                                  "users": len(s.clients),
                                  "has_password": s.password is not None})
    conn.send({"type": "rooms", "rooms": rooms})


def h_create_join(conn, msg):
    name = str(msg.get("user", "")).strip()[:20]
    if not name:
        return conn.send({"type": "error", "text": "Username required"})

    avatar_color = msg.get("avatar_color", "#2a9d8f")

    if msg["type"] == "create":
        with sessions_lock:
            requested_code = str(msg.get("session", "")).strip().upper()
            title = msg.get("title") or msg.get("room_name")
            s = None

            # Check if this is an original host re-opening / reconnecting to their existing room
            if requested_code and len(requested_code) == 4:
                if requested_code in sessions:
                    existing_s = sessions[requested_code]
                    if existing_s.host == name:
                        s = existing_s
                        if title:
                            s.title = title
                else:
                    restored = _restore_session_from_disk(requested_code)
                    if restored and restored.host == name:
                        s = restored
                        sessions[requested_code] = s
                        if title:
                            s.title = title

            if s is None:
                code = requested_code if (requested_code and len(requested_code) == 4 and requested_code not in sessions) else _code()
                room_title = title or f"Room {code}"
                s = Session(code, name, public=msg.get("public", False),
                            password=msg.get("password") or None, title=room_title)
                # Restore saved actions if re-hosting a saved board session
                if msg.get("actions"):
                    s.actions = [dict(a) for a in msg.get("actions") if isinstance(a, dict)]
                    s.by_id = {a["id"]: a for a in s.actions if "id" in a}
                sessions[code] = s
    else:
        code = str(msg.get("session", "")).strip().upper()
        with sessions_lock:
            s = sessions.get(code)
            if s is None:
                s = _restore_session_from_disk(code)
                if s:
                    sessions[code] = s
        if s is None:
            return conn.send({"type": "error", "text": "Room not found"})
        with s.lock:
            client_ip = conn.addr[0] if getattr(conn, "addr", None) else ""
            is_preauth = (name.lower() in [u.lower() for u in getattr(s, "preauthorized_users", set())]) or (client_ip in getattr(s, "preauthorized_ips", set()))
            if s.locked and name not in s.tokens and name != s.host and not is_preauth:
                return conn.send({"type": "error", "text": "Room is locked"})
            if s.password and msg.get("password") != s.password and name != s.host and not is_preauth:
                return conn.send({"type": "error", "text": "Wrong room password"})

    with s.lock:
        client_ip = conn.addr[0] if getattr(conn, "addr", None) else ""
        if client_ip in s.tokens and client_ip != name:
            del s.tokens[client_ip]
            if client_ip in s.permissions:
                s.permissions[name] = s.permissions.pop(client_ip)

        if name in s.clients:
            old_conn = s.clients[name]
            if old_conn is not conn:
                old_conn.session = None
                try:
                    old_conn.close()
                except Exception:
                    pass
                del s.clients[name]

        conn.name = name
        conn.session = s
        conn.color = COLORS[len(s.tokens) % len(COLORS)]
        conn.avatar_color = avatar_color

        tok = _token()
        conn.token = tok
        s.tokens[name] = tok
        s.clients[name] = conn
        s.avatar_colors[name] = avatar_color
        initial_can_draw = False if s.presentation_mode else True
        s.permissions.setdefault(name, {"can_draw": initial_can_draw, "is_cohost": False})

        conn.send({
            "type": "join_ack",
            "session": s.code,
            "title": getattr(s, "title", f"Room {s.code}"),
            "you": name,
            "color": conn.color,
            "is_host": name == s.host,
            "token": tok,
            "users": s.users_info(),
            "actions": s.actions,
            "chat": s.chat_log,
            "seq": s.seq,
            "public": s.public,
            "locked": s.locked,
            "presentation_mode": s.presentation_mode,
            "chat_permission": s.chat_permission,
            "permissions": s.permissions.get(name, {}),
            "session_works": s.session_works,
            "instance_save_perm": s.instance_save_perm,
            "instance_save_allowed": list(s.instance_save_allowed),
            "can_save_instance": s.can_save_instance(name),
        })

        s.broadcast({"type": "user_joined", "user": name, "color": conn.color,
                     "avatar_color": avatar_color, "users": s.users_info()},
                    exclude=name)
        s.autosave(force=True)
    print(f"[+] {name} joined room {s.code} from {conn.addr[0]}")


def h_resume(conn, msg):
    code = str(msg.get("session", "")).strip().upper()
    name = str(msg.get("user", "")).strip()
    tok = msg.get("token", "")
    last_seq = int(msg.get("last_seq", 0))

    with sessions_lock:
        s = sessions.get(code)
    if s is None:
        return conn.send({"type": "resume_failed", "text": "Room no longer exists"})

    with s.lock:
        if s.tokens.get(name) != tok:
            return conn.send({"type": "resume_failed", "text": "Invalid token"})

        old = s.clients.get(name)
        if old is not None and old is not conn:
            old.session = None
            try:
                old.close()
            except Exception:
                pass

        conn.name = name
        conn.session = s
        conn.token = tok
        conn.color = COLORS[list(s.tokens.keys()).index(name) % len(COLORS)]
        conn.avatar_color = s.avatar_colors.get(name, conn.color)
        s.clients[name] = conn

        conn.send({"type": "resume_ack", "is_host": name == s.host,
                   "users": s.users_info(),
                   "public": s.public, "locked": s.locked,
                   "presentation_mode": s.presentation_mode,
                   "chat_permission": s.chat_permission,
                   "permissions": s.permissions.get(name, {}),
                   "session_works": s.session_works,
                   "instance_save_perm": s.instance_save_perm,
                   "can_save_instance": s.can_save_instance(name)})

        for sq, m in s.history:
            if sq > last_seq:
                conn.send(m)

        conn.send({"type": "resume_done"})

        s.broadcast({"type": "user_joined", "user": name, "color": conn.color,
                     "avatar_color": conn.avatar_color,
                     "users": s.users_info()}, exclude=name)
    print(f"[~] {name} resumed in room {s.code}")


def h_stroke_pts(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if not s.can_draw(conn.name):
            conn.send({"type": "notice", "text": "🔒 Host has disabled your drawing permission (View-Only)"})
            return
        try:
            sid = str(msg["id"])
            pts = [[float(x), float(y)] for x, y in msg["points"]]
            brush = str(msg.get("brush", "pencil"))
            color = str(msg.get("color", conn.color))
            width = int(msg.get("width", 3))
            opacity = float(msg.get("opacity", 1.0))
        except (KeyError, ValueError, TypeError):
            return

        a = s.by_id.get(sid)
        if a is None:
            # Purge undone actions on starting a new stroke branch
            is_h = conn.name == s.host
            undone = [x for x in s.actions if x.get("undone") and (x.get("user") == conn.name or is_h)]
            for ua in undone:
                s.actions.remove(ua)
                s.by_id.pop(ua.get("id"), None)

            a = {"id": sid, "kind": "stroke", "user": conn.name,
                 "brush": brush, "color": color, "width": width,
                 "opacity": opacity, "points": [], "undone": False}
            s.actions.append(a)
            s.by_id[sid] = a
        elif a.get("user") != conn.name:
            return
        a["points"].extend(pts)

        s.seq_broadcast({"type": "stroke_pts", "id": sid, "user": conn.name,
                         "brush": brush, "color": color, "width": width,
                         "opacity": opacity, "points": pts})
        s.autosave()


def h_action(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if not s.can_draw(conn.name):
            return conn.send({"type": "notice", "text": "🔒 Host has disabled your drawing permission (View-Only)"})
        act = msg.get("action")
        if not act or "kind" not in act:
            return
        kind = act["kind"]
        if kind == "clear":
            p = s.permissions.get(conn.name, {})
            if conn.name != s.host and not p.get("is_cohost"):
                return conn.send({"type": "error", "text": "Only host can clear"})
        act["user"] = conn.name
        act.setdefault("id", f"{conn.name}-{int(time.time()*1000)}-{random.randint(0,9999)}")
        act["undone"] = False

        # Purge undone actions on performing a new action
        is_h = conn.name == s.host
        undone = [a for a in s.actions if a.get("undone") and (a.get("user") == conn.name or is_h)]
        for ua in undone:
            s.actions.remove(ua)
            s.by_id.pop(ua.get("id"), None)

        s.actions.append(act)
        s.by_id[act["id"]] = act
        s.seq_broadcast({"type": "action", "action": act})
        s.autosave(force=True)


def h_undo(conn, _msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if not s.can_draw(conn.name):
            return conn.send({"type": "notice", "text": "🔒 Host has disabled your drawing permission (View-Only)"})
        is_host = conn.name == s.host
        target = None
        for a in reversed(s.actions):
            if a.get("undone"):
                continue
            if a.get("user") == conn.name or is_host:
                target = a
                break
        if target is None:
            return conn.send({"type": "notice", "text": "Nothing to undo"})
        target["undone"] = True
        s.seq_broadcast({"type": "undo", "target": target["id"], "user": conn.name})
        s.autosave(force=True)


def h_redo(conn, _msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if not s.can_draw(conn.name):
            return conn.send({"type": "notice", "text": "🔒 Host has disabled your drawing permission (View-Only)"})
        is_host = conn.name == s.host
        target = None
        # Find the first undone action in chronological forward sequence
        for a in s.actions:
            if a.get("undone") and (a.get("user") == conn.name or is_host):
                target = a
                break
        if target is None:
            return conn.send({"type": "notice", "text": "Nothing to redo"})
        target["undone"] = False
        s.seq_broadcast({"type": "redo", "target": target["id"], "user": conn.name})
        s.autosave(force=True)


def h_cursor(conn, msg):
    s = conn.session
    if not s:
        return
    try:
        x, y = float(msg["x"]), float(msg["y"])
    except (KeyError, ValueError, TypeError):
        return
    s.broadcast({"type": "cursor", "user": conn.name, "x": x, "y": y},
                exclude=conn.name)


def h_chat_send(conn, msg):
    s = conn.session
    msg_id = str(msg.get("message_id") or f"msg_{uuid.uuid4().hex[:12]}")
    if not s:
        conn.send({"type": "chat_error", "message_id": msg_id, "error": "Not connected to a room"})
        return

    req_room = msg.get("room_id")
    if req_room and str(req_room).strip().upper() != s.code:
        req_room = s.code

    with s.lock:
        is_host = (conn.name == s.host)
        mode = s.chat_permission
        if mode == "no_one":
            conn.send({"type": "chat_error", "message_id": msg_id, "error": "Chat has been disabled by the host."})
            return
        elif mode == "host_only" and not is_host:
            conn.send({"type": "chat_error", "message_id": msg_id, "error": "Only the host can send messages."})
            return

    raw_text = msg.get("message") if "message" in msg else msg.get("text", "")
    txt = str(raw_text).strip()
    is_announcement = bool(msg.get("is_announcement", False)) and (conn.name == s.host)

    if not txt:
        conn.send({"type": "chat_error", "message_id": msg_id, "error": "Message cannot be empty"})
        return

    if len(txt) > 1000:
        conn.send({"type": "chat_error", "message_id": msg_id, "error": "Message exceeds maximum length of 1000 characters"})
        return

    with s.lock:
        if msg_id in s.seen_message_ids:
            conn.send({"type": "chat_ack", "message_id": msg_id, "status": "duplicate"})
            return

        s.seen_message_ids.add(msg_id)
        server_ts = time.strftime("%I:%M %p").lstrip("0")
        entry = {
            "message_id": msg_id,
            "room_id": s.code,
            "sender_id": conn.token or conn.name,
            "sender_name": conn.name,
            "sender_avatar_color": s.avatar_colors.get(conn.name, conn.avatar_color),
            "message": txt,
            "text": txt,
            "user": conn.name,
            "time": server_ts,
            "timestamp": server_ts,
            "is_system": False,
            "is_announcement": is_announcement,
        }
        s.chat_log.append(entry)
        if len(s.chat_log) > 1000:
            s.chat_log = s.chat_log[-500:]

        seq_msg = {"type": "chat_message", **entry}
        s.seq_broadcast(seq_msg)
        chat_db.save_message(entry, s.seq)
        s.autosave(force=True)

    conn.send({"type": "chat_ack", "message_id": msg_id, "status": "ok", "timestamp": server_ts})


def h_chat_permission_update(conn, msg):
    s = conn.session
    if not s:
        return conn.send({"type": "chat_error", "message_id": None, "error": "Not connected to a room"})

    with s.lock:
        if conn.name != s.host:
            return conn.send({"type": "chat_error", "message_id": None, "error": "Unauthorized: Only the host can change chat permissions."})

        mode = str(msg.get("permission_mode") or msg.get("mode", "everyone")).strip().lower()
        if mode not in ("everyone", "host_only", "no_one"):
            return conn.send({"type": "chat_error", "message_id": None, "error": f"Invalid permission mode: {mode}"})

        s.chat_permission = mode

        desc_map = {
            "everyone": "Host changed chat permissions to: Everyone.",
            "host_only": "Host changed chat permissions to: Host Only (Only host can send messages).",
            "no_one": "Host disabled chat for everyone."
        }
        desc = desc_map.get(mode, f"Chat permission set to {mode}")

        sys_id = f"sys_{uuid.uuid4().hex[:12]}"
        server_ts = time.strftime("%I:%M %p").lstrip("0")
        sys_entry = {
            "message_id": sys_id,
            "room_id": s.code,
            "sender_id": "system",
            "sender_name": "System",
            "sender_avatar_color": "#f1f5f9",
            "message": desc,
            "text": desc,
            "user": "System",
            "time": server_ts,
            "timestamp": server_ts,
            "is_system": True,
        }
        s.chat_log.append(sys_entry)
        chat_db.save_message(sys_entry, s.seq + 1)

        s.broadcast({
            "type": "chat_permission_changed",
            "room_id": s.code,
            "permission_mode": mode,
            "host_id": conn.name
        })
        s.seq_broadcast({"type": "chat_message", **sys_entry})
        s.autosave(force=True)


def h_chat_clear(conn, _msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if conn.name != s.host:
            return conn.send({"type": "chat_error", "message_id": None, "error": "Unauthorized: Only the host can clear chat history."})

        s.chat_log.clear()
        s.seen_message_ids.clear()
        chat_db.clear_room(s.code)

        sys_id = f"sys_{uuid.uuid4().hex[:12]}"
        server_ts = time.strftime("%I:%M %p").lstrip("0")
        desc = "Chat history cleared by host."
        sys_entry = {
            "message_id": sys_id,
            "room_id": s.code,
            "sender_id": "system",
            "sender_name": "System",
            "sender_avatar_color": "#f1f5f9",
            "message": desc,
            "text": desc,
            "user": "System",
            "time": server_ts,
            "timestamp": server_ts,
            "is_system": True,
        }
        s.chat_log.append(sys_entry)

        s.broadcast({
            "type": "chat_cleared",
            "room_id": s.code,
            "host": conn.name
        })
        s.seq_broadcast({"type": "chat_message", **sys_entry})
        s.autosave(force=True)


def h_chat_history_request(conn, _msg):
    s = conn.session
    if not s:
        return conn.send({"type": "chat_error", "message_id": None, "error": "Not connected to a room"})
    with s.lock:
        messages = list(s.chat_log)
    conn.send({
        "type": "chat_history",
        "room_id": s.code,
        "messages": messages,
    })


def h_chat_ack(conn, _msg):
    pass


def h_ping(conn, _msg):
    conn.send({"type": "pong"})


def h_save(conn, msg):
    s = conn.session
    if not s:
        return
    name = str(msg.get("name", "")).strip()
    if not name:
        return conn.send({"type": "error", "text": "Name required"})
    with s.lock:
        try:
            safe = s.save_named(name)
            conn.send({"type": "notice", "text": f"Board saved as '{safe}'"})
        except OSError as e:
            conn.send({"type": "error", "text": str(e)})


def h_list_saves(conn, _msg):
    conn.send({"type": "saves", "names": Session.list_saved()})


def h_load(conn, msg):
    s = conn.session
    if not s:
        return
    if conn.name != s.host:
        return conn.send({"type": "error", "text": "Only host can load"})
    name = str(msg.get("name", "")).strip()
    with s.lock:
        data = s.load_named(name)
        if data is None:
            return conn.send({"type": "error", "text": f"Save '{name}' not found"})
        s.actions = data.get("actions", [])
        s.by_id = {a["id"]: a for a in s.actions}
        s.chat_log = data.get("chat", [])
        s.seen_message_ids.update(m["message_id"] for m in s.chat_log if isinstance(m, dict) and "message_id" in m)
        snap = {"type": "snapshot", "actions": s.actions, "chat": s.chat_log,
                "users": s.users_info(), "seq": s.seq}
        s.broadcast(snap)


def h_resend(conn, msg):
    s = conn.session
    if not s:
        return
    frm = int(msg.get("from", 0))
    with s.lock:
        for sq, m in s.history:
            if sq > frm:
                conn.send(m)


def h_leave(conn, _msg):
    _disconnect(conn)


def h_host_control(conn, msg):
    s = conn.session
    if not s:
        return
    act = msg.get("action")
    target = msg.get("target", "")

    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        if not is_h and not is_co:
            return conn.send({"type": "error", "text": "Not authorized"})

        if act == "kick":
            if target == s.host:
                return
            tc = s.clients.get(target)
            if tc:
                tc.send({"type": "kicked", "text": "You were kicked by the host"})
                tc.close()
                del s.clients[target]
                s.hands_raised.discard(target)
                s.broadcast({"type": "user_left", "user": target,
                             "users": s.users_info()})

        elif act == "toggle_draw":
            p = s.permissions.setdefault(target, {"can_draw": True, "is_cohost": False})
            p["can_draw"] = not p.get("can_draw", True)

        elif act == "promote_cohost":
            if not is_h:
                return
            p = s.permissions.setdefault(target, {"can_draw": True, "is_cohost": False})
            p["is_cohost"] = not p.get("is_cohost", False)

        elif act == "transfer_host":
            if not is_h:
                return
            if target in s.clients:
                s.host = target

        elif act == "lock_room":
            if not is_h:
                return
            s.locked = not s.locked

        elif act == "set_password":
            if not is_h:
                return
            pw = msg.get("password")
            s.password = pw if pw else None

        elif act == "presentation_mode":
            if not is_h:
                return
            s.presentation_mode = not s.presentation_mode

        elif act == "all_can_draw":
            val = bool(msg.get("value", msg.get("can_draw", True)))
            for nm in s.permissions:
                if nm != s.host:
                    s.permissions[nm]["can_draw"] = val

        s.broadcast({"type": "host_control", "action": act,
                     "users": s.users_info(),
                     "host": s.host, "locked": s.locked,
                     "presentation_mode": s.presentation_mode})
        s.autosave(force=True)


def h_set_permission(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        if not is_h and not is_co:
            return conn.send({"type": "error", "text": "Not authorized"})

        targets = msg.get("targets", [])
        if isinstance(targets, str):
            targets = [targets]
        can_draw = bool(msg.get("can_draw", True))

        for t in targets:
            if t != s.host:
                p = s.permissions.setdefault(t, {"can_draw": True, "is_cohost": False})
                p["can_draw"] = can_draw

        s.broadcast({
            "type": "host_control",
            "action": "set_permission",
            "users": s.users_info(),
            "host": s.host,
            "locked": s.locked,
            "presentation_mode": s.presentation_mode
        })
        s.autosave(force=True)


def h_raise_hand(conn, _msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if conn.name in s.hands_raised:
            s.hands_raised.discard(conn.name)
        else:
            s.hands_raised.add(conn.name)
        s.broadcast({"type": "raise_hand", "user": conn.name,
                     "raised": conn.name in s.hands_raised,
                     "users": s.users_info()})


def h_reaction(conn, msg):
    s = conn.session
    if not s:
        return
    emoji = str(msg.get("emoji", ""))[:4]
    if emoji:
        s.broadcast({"type": "reaction", "user": conn.name, "emoji": emoji})


def h_save_instance(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        if not s.can_save_instance(conn.name):
            return conn.send({"type": "error", "text": "Host has not granted you permission to save to Session Works."})
        inst = msg.get("instance")
        if not isinstance(inst, dict):
            return
        inst["author"] = conn.name
        inst["timestamp"] = time.strftime("%I:%M:%S %p")
        if "id" not in inst:
            inst["id"] = f"inst_{int(time.time()*1000)}"
        s.session_works.append(inst)
        # Broadcast new instance to all connected participants in this whiteboard session
        s.broadcast({"type": "new_instance", "instance": inst, "author": conn.name})
        conn.send({"type": "instance_saved_ack", "id": inst.get("id")})
        s.autosave(force=True)
        print(f"[Instance Saved] {conn.name} saved instance '{inst.get('title')}' in room {s.code}")


def h_host_instance_perm(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        if not is_h and not is_co:
            return conn.send({"type": "error", "text": "Not authorized to change instance permissions"})
        perm = msg.get("perm", "everyone")
        if perm in ("everyone", "host_only", "selected"):
            s.instance_save_perm = perm
        if "allowed_users" in msg:
            s.instance_save_allowed = set(msg["allowed_users"])
            s.instance_save_allowed.add(s.host)
        s.broadcast({
            "type": "instance_perm_update",
            "perm": s.instance_save_perm,
            "allowed_users": list(s.instance_save_allowed),
            "users": s.users_info()
        })
        s.autosave(force=True)


def h_delete_instance(conn, msg):
    s = conn.session
    if not s:
        return
    iid = msg.get("id")
    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        target_inst = next((x for x in s.session_works if x.get("id") == iid), None)
        if not target_inst:
            return
        if not is_h and not is_co and target_inst.get("author") != conn.name:
            return conn.send({"type": "error", "text": "Not authorized to delete this instance"})
        s.session_works = [x for x in s.session_works if x.get("id") != iid]
        s.broadcast({"type": "instance_deleted", "id": iid})
        s.autosave(force=True)


def h_restore_instance(conn, msg):
    s = conn.session
    if not s:
        return
    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        if not is_h and not is_co:
            return conn.send({"type": "error", "text": "Restricted: Only the host or an assigned co-host can restore canvas instances in this collaborative room."})

        raw_acts = msg.get("actions", [])
        s.actions = [copy.deepcopy(a) for a in raw_acts if isinstance(a, dict)]
        s.by_id = {a["id"]: a for a in s.actions if "id" in a}
        s.seq += 1
        s.autosave(force=True)
        title = msg.get("title", "milestone")

        # Atomic snapshot broadcast to synchronize all room participants
        s.broadcast({
            "type": "snapshot",
            "actions": s.actions,
            "seq": s.seq,
            "users": s.users_info(),
            "session_works": s.session_works
        })
        announcement = {
            "type": "chat_message",
            "message_id": f"sys_{int(time.time()*1000)}",
            "room_code": s.code,
            "sender_name": "System",
            "sender_role": "Host" if is_h else "Co-Host",
            "avatar_color": "#2563eb",
            "content": f"Canvas restored to milestone instance '{title}' by {conn.name}.",
            "timestamp": time.strftime("%I:%M %p"),
            "msg_type": "text",
            "status": "delivered",
            "reply_to": None,
            "is_announcement": True
        }
        s.chat_log.append(announcement)
        s.broadcast(announcement)


def h_register_presence(conn, msg):
    name = str(msg.get("user", "")).strip()[:20]
    if name:
        conn.name = name
    avatar = msg.get("avatar_color")
    if avatar:
        conn.avatar_color = avatar
    conn.send({"type": "presence_ack", "user": conn.name, "ip": conn.addr[0] if getattr(conn, "addr", None) else "127.0.0.1"})


def h_list_connected_clients(conn, _msg):
    clients_list = []
    with all_clients_lock:
        for c in list(all_clients):
            if c is not conn and getattr(c, "addr", None):
                c_ip = c.addr[0]
                c_name = c.name or "Client"
                clients_list.append({
                    "name": c_name,
                    "ip": c_ip,
                    "in_room": c.session.code if c.session else None,
                    "in_current": (c.session == conn.session) if conn.session else False,
                })
    conn.send({"type": "connected_clients_list", "clients": clients_list})


def h_add_member(conn, msg):
    s = conn.session
    if not s:
        return conn.send({"type": "error", "text": "Not connected to an active room"})

    with s.lock:
        is_h = conn.name == s.host
        is_co = s.permissions.get(conn.name, {}).get("is_cohost", False)
        if not is_h and not is_co:
            return conn.send({"type": "error", "text": "Unauthorized: Only the host or co-host can add members to this session."})

        raw_target = str(msg.get("target", "")).strip()
        if not raw_target:
            return conn.send({"type": "error", "text": "Please enter a username or IP address to add."})

        # Check if already active in this room
        for nm, c in list(s.clients.items()):
            if nm.lower() == raw_target.lower() or (getattr(c, "addr", None) and c.addr[0] == raw_target):
                return conn.send({"type": "notice", "text": f"'{nm}' is already an active member in this whiteboard session."})

        # Search across all connected sockets on this server
        matched_conn = None
        target_token = re.sub(r"[\(\)\[\]]", " ", raw_target).strip()
        tokens = [t.strip() for t in target_token.split() if t.strip()]

        with all_clients_lock:
            # 1. Match by username
            for c in all_clients:
                if c.name and (c.name.lower() == raw_target.lower() or any(t.lower() == c.name.lower() for t in tokens)):
                    matched_conn = c
                    break
            # 2. Match by IP address
            if not matched_conn:
                for c in all_clients:
                    if getattr(c, "addr", None) and (c.addr[0] == raw_target or any(t == c.addr[0] for t in tokens)):
                        matched_conn = c
                        break

        if matched_conn is not None:
            target_name = matched_conn.name or raw_target
            # Detach from previous session if any
            old_s = matched_conn.session
            if old_s and old_s is not s:
                with old_s.lock:
                    if old_s.clients.get(target_name) is matched_conn:
                        del old_s.clients[target_name]
                        old_s.broadcast({"type": "user_left", "user": target_name, "users": old_s.users_info()})

            matched_conn.session = s
            matched_conn.name = target_name
            tok = s.tokens.get(target_name) or _token()
            s.tokens[target_name] = tok
            matched_conn.token = tok

            if target_name not in s.avatar_colors:
                c_idx = list(s.tokens.keys()).index(target_name) % len(COLORS)
                s.avatar_colors[target_name] = COLORS[c_idx]
            matched_conn.color = s.avatar_colors[target_name]
            matched_conn.avatar_color = s.avatar_colors[target_name]

            s.permissions.setdefault(target_name, {"can_draw": True, "is_cohost": False})
            s.clients[target_name] = matched_conn

            target_ip = matched_conn.addr[0] if getattr(matched_conn, "addr", None) else "LAN"

            # Send complete snapshot and join acknowledgement to the added member
            matched_conn.send({
                "type": "join_ack",
                "session": s.code,
                "code": s.code,
                "title": getattr(s, "title", f"Room {s.code}"),
                "you": target_name,
                "color": matched_conn.color,
                "avatar_color": matched_conn.avatar_color,
                "is_host": target_name == s.host,
                "token": tok,
                "users": s.users_info(),
                "actions": s.actions,
                "chat": s.chat_log,
                "seq": s.seq,
                "public": s.public,
                "locked": s.locked,
                "presentation_mode": s.presentation_mode,
                "chat_permission": s.chat_permission,
                "permissions": s.permissions.get(target_name, {}),
                "session_works": s.session_works,
                "instance_save_perm": s.instance_save_perm,
                "can_save_instance": s.can_save_instance(target_name),
                "added_by_host": True,
                "added_by": conn.name,
            })

            # Broadcast user_joined to all other participants
            s.broadcast({
                "type": "user_joined",
                "user": target_name,
                "color": matched_conn.color,
                "avatar_color": matched_conn.avatar_color,
                "users": s.users_info()
            }, exclude=target_name)

            # System chat announcement
            server_ts = time.strftime("%I:%M %p").lstrip("0")
            ann = {
                "message_id": f"sys_{uuid.uuid4().hex[:12]}",
                "room_id": s.code,
                "sender_id": "system",
                "sender_name": "System",
                "sender_avatar_color": "#f1f5f9",
                "message": f"➕ {target_name} ({target_ip}) was added to this whiteboard session by {conn.name}.",
                "text": f"➕ {target_name} ({target_ip}) was added to this whiteboard session by {conn.name}.",
                "user": "System",
                "time": server_ts,
                "timestamp": server_ts,
                "is_system": True,
            }
            s.chat_log.append(ann)
            chat_db.save_message(ann, s.seq + 1)
            s.seq_broadcast({"type": "chat_message", **ann})
            s.autosave(force=True)

            conn.send({"type": "notice", "text": f"Successfully added {target_name} ({target_ip}) to this session!"})
            print(f"[+] Host {conn.name} added member {target_name} ({target_ip}) to room {s.code}")

        else:
            # Client not currently connected online: pre-enroll them into session roster
            target_name = raw_target
            tok = _token()
            s.tokens[target_name] = tok
            s.permissions.setdefault(target_name, {"can_draw": True, "is_cohost": False})
            if target_name not in s.avatar_colors:
                c_idx = list(s.tokens.keys()).index(target_name) % len(COLORS)
                s.avatar_colors[target_name] = COLORS[c_idx]

            if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target_name):
                s.preauthorized_ips.add(target_name)
            else:
                s.preauthorized_users.add(target_name.lower())

            s.broadcast({
                "type": "users_update",
                "users": s.users_info()
            })

            server_ts = time.strftime("%I:%M %p").lstrip("0")
            ann = {
                "message_id": f"sys_{uuid.uuid4().hex[:12]}",
                "room_id": s.code,
                "sender_id": "system",
                "sender_name": "System",
                "sender_avatar_color": "#f1f5f9",
                "message": f"➕ {target_name} was pre-enrolled into the whiteboard session roster by {conn.name}.",
                "text": f"➕ {target_name} was pre-enrolled into the whiteboard session roster by {conn.name}.",
                "user": "System",
                "time": server_ts,
                "timestamp": server_ts,
                "is_system": True,
            }
            s.chat_log.append(ann)
            chat_db.save_message(ann, s.seq + 1)
            s.seq_broadcast({"type": "chat_message", **ann})
            s.autosave(force=True)

            conn.send({"type": "notice", "text": f"Enrolled '{target_name}' into this session. They will automatically sync when connecting!"})
            print(f"[*] Host {conn.name} pre-enrolled {target_name} into room {s.code} roster")


# ── disconnect ────────────────────────────────────────────────────────
def _disconnect(conn):
    s = conn.session
    if s and conn.name:
        with s.lock:
            if s.clients.get(conn.name) is conn:
                del s.clients[conn.name]
                s.hands_raised.discard(conn.name)
                # Keep s.host intact: host privileges never reassign to another user
                s.broadcast({"type": "user_left", "user": conn.name,
                             "users": s.users_info()})
                s.autosave(force=True)
                print(f"[-] {conn.name} left room {s.code}")
    conn.close()


# ── dispatch table ────────────────────────────────────────────────────
_DISPATCH = {
    "create": h_create_join,
    "join": h_create_join,
    "resume": h_resume,
    "list_rooms": h_list_rooms,
    "stroke_pts": h_stroke_pts,
    "action": h_action,
    "undo": h_undo,
    "redo": h_redo,
    "cursor": h_cursor,
    "chat": h_chat_send,
    "chat_send": h_chat_send,
    "CHAT_SEND": h_chat_send,
    "chat_history_request": h_chat_history_request,
    "CHAT_HISTORY_REQUEST": h_chat_history_request,
    "chat_ack": h_chat_ack,
    "CHAT_ACK": h_chat_ack,
    "chat_permission_update": h_chat_permission_update,
    "CHAT_PERMISSION_UPDATE": h_chat_permission_update,
    "chat_clear": h_chat_clear,
    "clear_chat": h_chat_clear,
    "CHAT_CLEAR": h_chat_clear,
    "ping": h_ping,
    "save": h_save,
    "list_saves": h_list_saves,
    "load": h_load,
    "resend": h_resend,
    "leave": h_leave,
    "host_control": h_host_control,
    "set_permission": h_set_permission,
    "raise_hand": h_raise_hand,
    "reaction": h_reaction,
    "save_instance": h_save_instance,
    "host_instance_perm": h_host_instance_perm,
    "delete_instance": h_delete_instance,
    "restore_instance": h_restore_instance,
    "RESTORE_INSTANCE": h_restore_instance,
    "register_presence": h_register_presence,
    "list_connected_clients": h_list_connected_clients,
    "add_member": h_add_member,
    "ADD_MEMBER": h_add_member,
}


def client_thread(sock, addr):
    conn = ClientConn(sock, addr)
    with all_clients_lock:
        all_clients.add(conn)
    f = sock.makefile("r", encoding="utf-8")
    try:
        while True:
            line = f.readline()
            if not line:
                break
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            handler = _DISPATCH.get(msg.get("type"))
            if handler:
                try:
                    handler(conn, msg)
                except Exception as exc:
                    print(f"[!] handler error ({msg.get('type')}): {exc}")
    except OSError:
        pass
    finally:
        with all_clients_lock:
            all_clients.discard(conn)
        _disconnect(conn)


# ── main ──────────────────────────────────────────────────────────────
def get_local_ip_info():
    """Detects primary physical network adapter IP (Wi-Fi, Mobile Hotspot, or Ethernet).
    Excludes virtual internal switches (WSL, Hyper-V, VirtualBox, VMware, Docker, etc.) and APIPA (169.254.x.x)."""
    try:
        import psutil
        stats = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        candidates = []
        virtual_names = [
            "vethernet", "hyper-v", "wsl", "virtualbox", "vmware", "loopback",
            "bluetooth", "docker", "tailscale", "zerotier", "hamachi", "tap",
            "tun", "teredo", "npcap", "pseudo"
        ]
        for iface, if_addrs in addrs.items():
            iface_lower = iface.lower()
            if any(v in iface_lower for v in virtual_names):
                continue
            stat = stats.get(iface)
            is_up = stat.isup if stat else False
            for a in if_addrs:
                if a.family == socket.AF_INET:
                    ip = a.address
                    if ip.startswith("127.") or ip.startswith("169.254."):
                        continue
                    priority = 10.0
                    if any(w in iface_lower for w in ["wi-fi", "wifi", "wireless"]):
                        priority = 1.0
                    elif any(e in iface_lower for e in ["ethernet", "lan"]):
                        priority = 2.0
                    elif any(h in iface_lower for h in ["hotspot", "hosted"]):
                        priority = 1.0

                    if ip.startswith("192.168.") or ip.startswith("10."):
                        priority -= 0.5
                    elif ip.startswith("172."):
                        try:
                            sec = int(ip.split(".")[1])
                            if 16 <= sec <= 31:
                                priority -= 0.5
                        except Exception:
                            pass
                    candidates.append((priority, is_up, iface, ip))
        candidates.sort(key=lambda c: (c[0], not c[1]))
        if candidates:
            best = candidates[0]
            return best[3], best[2]
    except Exception:
        pass

    try:
        raw_ips = [x[4][0] for x in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
        filtered = [ip for ip in raw_ips if not ip.startswith("127.") and not ip.startswith("169.254.")]
        filtered.sort(key=lambda ip: (0 if ip.startswith("192.168.") or ip.startswith("10.") else 1))
        if filtered:
            return filtered[0], "LAN"
    except Exception:
        pass

    return "192.168.1.1", "LAN"


def get_local_ip():
    ip, _ = get_local_ip_info()
    return ip


def start_discovery_responder():
    """Listens for UDP discovery broadcasts and replies with server IP & public rooms."""
    def _loop():
        try:
            udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if hasattr(socket, "SO_BROADCAST"):
                udp.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            udp.bind(("", DISCOVERY_PORT))
        except Exception as e:
            print(f"[!] UDP discovery bind error: {e}")
            return

        while True:
            try:
                data, addr = udp.recvfrom(2048)
                msg = json.loads(data.decode("utf-8").strip())
                if msg.get("type") == "discover":
                    with sessions_lock:
                        rooms = []
                        for code, s in sessions.items():
                            with s.lock:
                                if s.public and not s.locked:
                                    rooms.append({
                                        "code": code,
                                        "title": getattr(s, "title", f"Room {code}"),
                                        "host": s.host,
                                        "users": len(s.clients),
                                        "has_password": s.password is not None
                                    })
                    resp = {
                        "type": "discover_reply",
                        "ip": get_local_ip(),
                        "port": PORT,
                        "rooms": rooms
                    }
                    reply_bytes = (json.dumps(resp) + "\n").encode("utf-8")
                    udp.sendto(reply_bytes, addr)
            except Exception:
                pass

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t


def main():
    # Preload saved room sessions from disk so rooms persist smoothly across server restarts
    with sessions_lock:
        if os.path.isdir(SAVES_DIR):
            for fn in os.listdir(SAVES_DIR):
                if fn.startswith("autosave_") and fn.endswith(".json"):
                    code_cand = fn[len("autosave_"):-5].upper()
                    restored = _restore_session_from_disk(code_cand)
                    if restored:
                        sessions[code_cand] = restored
                        print(f"[*] Preloaded active room session {code_cand} ('{restored.title}') for host {restored.host}")

    start_discovery_responder()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen()

    ip, iface = get_local_ip_info()

    print(f"Whiteboard server running on {iface} adapter ({ip}:{PORT})")
    print(f"Clients on LAN / Wi-Fi / Hotspot connect to: {ip}:{PORT}")
    print(f"UDP LAN discovery responder active on port {DISCOVERY_PORT}")
    print(f"Saves directory: {os.path.abspath(SAVES_DIR)}")

    while True:
        sock, addr = srv.accept()
        threading.Thread(target=client_thread, args=(sock, addr), daemon=True).start()


if __name__ == "__main__":
    main()

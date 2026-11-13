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
import dgram from 'node:dgram';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const DISCOVERY_PORT = 45455;
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

/**
 * Detects real physical network adapters (Wi-Fi, Mobile Hotspot, Ethernet LAN).
 * Strictly filters out virtual/internal software interfaces (WSL, Hyper-V, VirtualBox, Docker, etc.)
 * Computes exact CIDR subnet and broadcast addresses for LAN discovery.
 */
function getValidPhysicalAdapters() {
  const interfaces = os.networkInterfaces();
  const valid = [];
  const virtualRegex = /(vethernet|hyper-v|wsl|virtualbox|vmware|loopback|bluetooth|docker|tailscale|zerotier|hamachi|tap|tun|teredo|npcap|pseudo)/i;

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || virtualRegex.test(name)) continue;

    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

      // Filter out MAC addresses belonging to common virtual hypervisors
      const mac = (addr.mac || '').toLowerCase();
      if (mac.startsWith('00:15:5d') || mac.startsWith('08:00:27') || mac.startsWith('00:05:69')) {
        continue;
      }

      const nameLower = name.toLowerCase();
      let priority = 10;
      let typeLabel = 'LAN';
      if (/wi-?fi|wlan|wireless/i.test(nameLower)) {
        priority = 1;
        typeLabel = 'Wi-Fi / Hotspot';
      } else if (/ethernet/i.test(nameLower)) {
        priority = 2;
        typeLabel = 'Ethernet LAN';
      } else if (/hotspot|hosted/i.test(nameLower)) {
        priority = 1;
        typeLabel = 'Mobile Hotspot';
      }

      // Check private IP classes
      if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
        priority -= 0.5;
      } else if (ip.startsWith('172.')) {
        try {
          const sec = parseInt(ip.split('.')[1], 10);
          if (sec >= 16 && sec <= 31) priority -= 0.5;
        } catch (e) {}
      }

      let subnet = '';
      let broadcast = '';
      try {
        const ipParts = ip.split('.').map(Number);
        const maskParts = (addr.netmask || '255.255.255.0').split('.').map(Number);
        const netParts = ipParts.map((p, i) => p & maskParts[i]);
        const bcastParts = ipParts.map((p, i) => p | (~maskParts[i] & 255));
        const prefix = addr.cidr ? addr.cidr.split('/')[1] : '24';
        subnet = `${netParts.join('.')}/${prefix}`;
        broadcast = bcastParts.join('.');
      } catch (e) {
        subnet = `${ip}/24`;
        broadcast = '255.255.255.255';
      }

      valid.push({
        interface: name,
        type: typeLabel,
        ip,
        netmask: addr.netmask,
        cidr: addr.cidr,
        subnet,
        broadcast,
        url: `http://${ip}:${PORT}`,
        priority
      });
    }
  }

  valid.sort((a, b) => a.priority - b.priority);
  return valid;
}

/**
 * Listens for LAN UDP discovery broadcasts and replies with active public rooms.
 */
function startLanDiscoveryResponder() {
  try {
    const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('error', (err) => {
      console.log('[LAN Discovery] UDP note:', err.message);
    });

    udp.on('message', (msg, rinfo) => {
      try {
        const payload = JSON.parse(msg.toString());
        if (payload.type === 'discover') {
          const adapters = getValidPhysicalAdapters();
          const hostIp = adapters.length > 0 ? adapters[0].ip : rinfo.address;
          // Broadcast all active public rooms to local network so anyone on LAN / Wi-Fi can join
          const publicRooms = db.getPublicRooms()
            .map(r => ({
              code: r.code,
              title: r.title,
              host_name: r.host_name,
              host_user_code: r.host_user_code,
              users_count: r.users_count || 1,
              network_mode: r.network_mode
            }));

          if (publicRooms.length === 0) return;

          const reply = Buffer.from(JSON.stringify({
            type: 'discover_reply',
            app: 'collaborative-whiteboard',
            port: PORT,
            ip: hostIp,
            url: `http://${hostIp}:${PORT}`,
            rooms: publicRooms
          }));

          udp.send(reply, rinfo.port, rinfo.address);
        }
      } catch (e) {}
    });

    udp.bind(DISCOVERY_PORT, '0.0.0.0', () => {
      try {
        udp.setBroadcast(true);
      } catch (e) {}
    });
  } catch (err) {
    console.log('[LAN Discovery] Initialization note:', err.message);
  }
}
startLanDiscoveryResponder();

// ── REST API ROUTES ──────────────────────────────────────────────────

// Health check for Cloud Hosting platforms (Render, Railway, etc.)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

let activeTunnel = null;
let activeTunnelUrl = null;

// Start / Retrieve Free Public Internet Tunnel for Cross-Network Collaboration
app.post('/api/internet/start-tunnel', async (req, res) => {
  if (activeTunnelUrl) {
    return res.json({ success: true, public_url: activeTunnelUrl });
  }

  try {
    const localtunnel = (await import('localtunnel')).default;
    activeTunnel = await localtunnel({ port: PORT });
    activeTunnelUrl = activeTunnel.url;
    activeTunnel.on('close', () => {
      activeTunnel = null;
      activeTunnelUrl = null;
    });
    console.log('[Internet Mode] Public Tunnel established at:', activeTunnelUrl);

    // Announce active rooms to the global ntfy registry with both tunnel and LAN endpoints
    try {
      const allRooms = db.getPublicRooms();
      const adapters = getValidPhysicalAdapters();
      const lanUrls = adapters.map(a => `http://${a.ip}:${PORT}`);
      allRooms.forEach(r => {
        fetch(`https://ntfy.sh/wb-room-${r.code.toLowerCase()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: r.code,
            url: activeTunnelUrl || '',
            lan_urls: lanUrls,
            title: r.title,
            host: r.host_name,
            network_mode: r.network_mode || 'cloud',
            timestamp: Date.now()
          })
        }).catch(() => {});
      });
    } catch(e) {}

    res.json({ success: true, public_url: activeTunnelUrl });
  } catch (err) {
    console.error('[Internet Mode] Could not establish tunnel:', err.message);
    res.status(500).json({ error: 'Could not establish internet tunnel: ' + err.message });
  }
});

app.get('/api/internet/status', (req, res) => {
  res.json({
    active: Boolean(activeTunnelUrl),
    public_url: activeTunnelUrl
  });
});

// Network Discovery API (For zero-internet Hotspot and Wi-Fi LAN)
app.get('/api/network-info', (req, res) => {
  const adapters = getValidPhysicalAdapters();
  const primary = adapters.length > 0 ? adapters[0] : null;

  res.json({
    port: PORT,
    hostname: os.hostname(),
    adapters,
    primary_ip: primary?.ip || '127.0.0.1',
    primary_adapter: primary,
    primary_url: primary?.url || `http://localhost:${PORT}`,
    subnet: primary?.subnet || '',
    broadcast: primary?.broadcast || ''
  });
});

// Subnet LAN Room Scanner (Discovers active whiteboard hosts on the same LAN without internet)
app.get('/api/lan/scan', (req, res) => {
  const adapters = getValidPhysicalAdapters();
  const discovered = [];
  const seenUrls = new Set();

  try {
    const client = dgram.createSocket('udp4');
    client.bind(0, () => {
      try { client.setBroadcast(true); } catch (e) {}

      const probe = Buffer.from(JSON.stringify({ type: 'discover', from_port: PORT }));
      const targets = new Set(['255.255.255.255']);
      adapters.forEach(a => {
        if (a.broadcast) targets.add(a.broadcast);
      });

      targets.forEach(t => {
        try { client.send(probe, DISCOVERY_PORT, t); } catch (e) {}
      });
    });

    client.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'discover_reply' && data.rooms && data.rooms.length > 0) {
          const targetUrl = data.url || `http://${rinfo.address}:${data.port || PORT}`;
          if (!seenUrls.has(targetUrl)) {
            seenUrls.add(targetUrl);
            discovered.push({
              ip: data.ip || rinfo.address,
              port: data.port || PORT,
              url: targetUrl,
              rooms: data.rooms
            });
          }
        }
      } catch (e) {}
    });

    // Wait 900ms for LAN replies
    setTimeout(() => {
      try { client.close(); } catch (e) {}
      res.json({
        success: true,
        adapters,
        discovered
      });
    }, 900);
  } catch (err) {
    res.json({ success: true, adapters, discovered });
  }
});

// Verify if a target host IP is in the same physical LAN subnet
app.post('/api/lan/verify-host', (req, res) => {
  const { host } = req.body;
  if (!host) return res.status(400).json({ error: 'Host IP is required' });

  const cleanIp = host.replace(/^https?:\/\//, '').split(':')[0].trim();
  const adapters = getValidPhysicalAdapters();

  let matchedAdapter = null;
  for (const a of adapters) {
    try {
      const ipParts = a.ip.split('.').map(Number);
      const maskParts = (a.netmask || '255.255.255.0').split('.').map(Number);
      const hostParts = cleanIp.split('.').map(Number);
      if (hostParts.length === 4) {
        const net1 = ipParts.map((p, i) => p & maskParts[i]).join('.');
        const net2 = hostParts.map((p, i) => p & maskParts[i]).join('.');
        if (net1 === net2) {
          matchedAdapter = a;
          break;
        }
      }
    } catch (e) {}
  }

  res.json({
    sameSubnet: !!matchedAdapter,
    matchedAdapter: matchedAdapter ? matchedAdapter.interface : null,
    localSubnets: adapters.map(a => `${a.interface}: ${a.subnet}`),
    targetIp: cleanIp
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
  const { title, hostUserCode, hostName, isPublic, password, networkMode } = req.body;
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

    const room = db.createRoom(
      code,
      title,
      hostUserCode,
      hostName || 'Host',
      isPublic !== false,
      password,
      networkMode || 'hotspot'
    );

    // Announce room in global registry with both tunnel and local network endpoints
    try {
      const adapters = getValidPhysicalAdapters();
      const lanUrls = adapters.map(a => `http://${a.ip}:${PORT}`);
      fetch(`https://ntfy.sh/wb-room-${code.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: code,
          url: activeTunnelUrl || '',
          lan_urls: lanUrls,
          title: title.trim(),
          host: hostName || 'Host',
          network_mode: networkMode || 'cloud',
          timestamp: Date.now()
        })
      }).catch(() => {});
    } catch (e) {}

    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve room across Localhost, Cloud Tunnel Registry, and Global Internet
app.get('/api/rooms/resolve/:code', async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code || code.length < 3) return res.status(400).json({ error: 'Invalid room code' });

  // 1. Check local database
  const localRoom = db.getRoom(code);
  if (localRoom) {
    return res.json({
      success: true,
      found: true,
      mode: 'local',
      url: '',
      room: localRoom
    });
  }

  // 2. Check cloud & cross-network registry via ntfy.sh
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const ntfyRes = await fetch(`https://ntfy.sh/wb-room-${code.toLowerCase()}/json?poll=1&since=24h`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (ntfyRes.ok) {
      const text = await ntfyRes.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(lines[i]);
          const payload = typeof item.message === 'string' ? JSON.parse(item.message) : item.message;
          if (payload && payload.room && payload.room.toUpperCase() === code) {
            const candidateUrls = [];
            if (payload.url) candidateUrls.push(payload.url.replace(/\/$/, ''));
            if (Array.isArray(payload.lan_urls)) {
              payload.lan_urls.forEach(u => candidateUrls.push(u.replace(/\/$/, '')));
            }

            for (const cUrl of candidateUrls) {
              try {
                const verifyController = new AbortController();
                const verifyTimeout = setTimeout(() => verifyController.abort(), 2500);
                const remoteRes = await fetch(`${cUrl}/api/rooms/${code}`, {
                  headers: { 'Bypass-Tunnel-Reminder': 'true' },
                  signal: verifyController.signal
                });
                clearTimeout(verifyTimeout);
                if (remoteRes.ok) {
                  const remoteData = await remoteRes.json();
                  if (remoteData.room) {
                    return res.json({
                      success: true,
                      found: true,
                      mode: 'cloud',
                      url: cUrl,
                      room: remoteData.room
                    });
                  }
                }
              } catch (verErr) {}
            }

            // Fallback: If verification is slow but payload was published recently (< 2 hours)
            if (payload.url || (payload.lan_urls && payload.lan_urls.length > 0)) {
              return res.json({
                success: true,
                found: true,
                mode: 'cloud',
                url: payload.url || payload.lan_urls[0],
                room: {
                  code: payload.room.toUpperCase(),
                  title: payload.title || 'Collaborative Whiteboard',
                  host_name: payload.host || 'Host'
                }
              });
            }
          }
        } catch (parseErr) {}
      }
    }
  } catch (ntfyErr) {}

  return res.json({ success: true, found: false });
});

// Rapid Subnet LAN Probe (Fallback if UDP broadcast is blocked by Wi-Fi router AP isolation)
app.get('/api/lan/find-room/:code', async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required' });

  const adapters = getValidPhysicalAdapters();
  const candidateIps = new Set();
  const candidatePorts = [PORT, 5000, 10000, 3000, 8080];

  ['192.168.43.1', '192.168.137.1', '192.168.1.1', '192.168.0.1', '10.0.0.1'].forEach(ip => candidateIps.add(ip));

  for (const a of adapters) {
    const parts = a.ip.split('.');
    if (parts.length === 4) {
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      candidateIps.add(`${prefix}.1`);
      const currentLast = parseInt(parts[3], 10);
      for (let offset = -12; offset <= 12; offset++) {
        const targetLast = currentLast + offset;
        if (targetLast > 0 && targetLast < 255 && targetLast !== currentLast) {
          candidateIps.add(`${prefix}.${targetLast}`);
        }
      }
    }
  }

  const probeTasks = [];
  for (const ip of candidateIps) {
    for (const port of candidatePorts) {
      probeTasks.push(async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 450);
          const url = `http://${ip}:${port}`;
          const probeRes = await fetch(`${url}/api/rooms/${code}`, {
            headers: { 'Bypass-Tunnel-Reminder': 'true' },
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (probeRes.ok) {
            const data = await probeRes.json();
            if (data.room) return { url, room: data.room, ip, port };
          }
        } catch (e) {}
        return null;
      });
    }
  }

  // Run in chunks to prevent socket exhaustion
  const chunkSize = 20;
  for (let i = 0; i < probeTasks.length; i += chunkSize) {
    const batch = probeTasks.slice(i, i + chunkSize).map(fn => fn());
    const batchResults = await Promise.all(batch);
    const hit = batchResults.find(Boolean);
    if (hit) {
      return res.json({ success: true, found: true, url: hit.url, room: hit.room, ip: hit.ip });
    }
  }

  res.json({ success: true, found: false });
});

// User Activity Logs API
app.get('/api/user/:code/activity-logs', (req, res) => {
  try {
    const logs = db.getUserActivityLogs(req.params.code);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/log-activity', (req, res) => {
  const { user_code, room_code, action_type, details } = req.body;
  if (!user_code || !action_type) return res.status(400).json({ error: 'Missing parameters' });
  db.logUserActivity(user_code, room_code, action_type, details);
  res.json({ success: true });
});

// Get room details & full state snapshot
app.get('/api/rooms/:code', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const room = db.getRoom(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const rawMembers = db.getRoomMembers(code);
    const members = getOnlineStatusMembers(code, rawMembers, room);
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

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

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

// Periodic server heartbeat to keep connections active through routers & localtunnel
const serverHeartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      handleWsDisconnect(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  });
}, 25000);

wss.on('close', () => {
  clearInterval(serverHeartbeat);
});

function handleWsMessage(ws, msg) {
  ws.isAlive = true;
  const meta = wsMeta.get(ws) || {};
  const type = msg.type;

  switch (type) {
    case 'heartbeat':
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }

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

      // Fetch snapshot data (public items + only this user's private items)
      const actions = db.getRoomActions(roomCode);
      const chat = db.getChatHistory(roomCode);
      const milestones = db.getRoomMilestones(roomCode, userCode);
      const publicWorks = db.getPublicWorks(roomCode, userCode);

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

    // 9.1 Synchronize Canvas Grid Style Across All Clients
    case 'set_grid_style': {
      if (!meta.room_code) return;
      const { perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!perms.can_draw) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Only the host or permitted members can change the room grid style.'
        }));
      }

      const gridStyle = msg.grid_style || 'square';
      db.updateRoomGridStyle(meta.room_code, gridStyle);

      broadcastToRoom(meta.room_code, {
        type: 'grid_style_updated',
        grid_style: gridStyle,
        updated_by: meta.user_name
      });
      break;
    }

    // 10. Save Canvas Milestone / Instance (Supports Private System vs Public Works)
    case 'save_milestone': {
      if (!meta.room_code) return;
      const { isHost, perms } = getMemberPermissions(meta.room_code, meta.user_code);
      const isPublic = msg.is_public !== false && msg.is_public !== 0;

      // Anyone can save privately in their own system; but sharing to public works requires permission
      if (isPublic && !isHost && !perms.can_instances) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Sharing instances to public works is disabled for you by the host.'
        }));
      }

      const snap = msg.snapshot || db.getRoomActions(meta.room_code);
      const milestone = {
        id: msg.id || `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: msg.title || 'Saved Milestone',
        author_code: meta.user_code,
        author_name: meta.user_name,
        snapshot: snap,
        original_snapshot_json: snap,
        host_sandbox_json: snap,
        is_public: isPublic ? 1 : 0,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      db.saveMilestone(meta.room_code, milestone);

      if (isPublic) {
        // Broadcast to public space
        broadcastToRoom(meta.room_code, {
          type: 'new_milestone',
          milestone
        });

        const sysNotice = {
          id: `sys_${Date.now()}`,
          room_code: meta.room_code,
          sender_code: 'system',
          sender_name: 'System',
          avatar_color: '#2563eb',
          message: `📸 ${meta.user_name} saved instance: '${milestone.title}' to Public Works`,
          timestamp: milestone.timestamp,
          is_system: true
        };
        db.saveChatMessage(meta.room_code, sysNotice);
        broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });
      } else {
        // Saved strictly to private system - deliver to this user's socket only
        ws.send(JSON.stringify({
          type: 'new_milestone',
          milestone,
          is_private: true
        }));
      }
      break;
    }

    // 11. Restore Canvas Milestone (Strictly HOST or Cohost)
    case 'restore_milestone': {
      if (!meta.room_code) return;
      const { isHost, perms } = getMemberPermissions(meta.room_code, meta.user_code);

      if (!isHost && perms.role !== 'cohost') {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Restricted: Only the host has permission to restore canvas instances to the live whiteboard.'
        }));
      }

      let actionsToRestore = msg.actions || msg.snapshot || [];
      if (typeof actionsToRestore === 'string') {
        try { actionsToRestore = JSON.parse(actionsToRestore); } catch(e) { actionsToRestore = []; }
      }
      if (!Array.isArray(actionsToRestore)) actionsToRestore = [];

      // Atomically replace all room actions with the restored milestone snapshot
      db.replaceRoomActions(meta.room_code, actionsToRestore);
      const updatedActions = db.getRoomActions(meta.room_code);

      broadcastToRoom(meta.room_code, {
        type: 'snapshot_restored',
        actions: updatedActions,
        title: msg.title || 'Restored Milestone',
        restored_by: meta.user_name
      });

      const sysNotice = {
        id: `sys_${Date.now()}`,
        room_code: meta.room_code,
        sender_code: 'system',
        sender_name: 'System',
        avatar_color: '#2563eb',
        message: `🔄 Canvas restored to milestone '${msg.title || 'Instance'}' by Host ${meta.user_name}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_system: true
      };
      db.saveChatMessage(meta.room_code, sysNotice);
      broadcastToRoom(meta.room_code, { type: 'chat_message', ...sysNotice });
      break;
    }

    // Top-Level Matrix Permissions (Host Only)
    case 'update_matrix_permissions': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code?.trim().toUpperCase() === meta.user_code?.trim().toUpperCase();
      if (!isHost) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Unauthorized: Host action only' }));
      }

      const { permissions, perm_key, selected_user_codes } = msg;

      if (perm_key && selected_user_codes !== undefined) {
        // Targeted Selected Members Dialog Box confirmation
        db.setMatrixSelectedMembers(meta.room_code, perm_key, selected_user_codes);
      } else if (permissions) {
        db.updateRoomPermissions(meta.room_code, permissions);
        if (permissions.canva_perm === 'host_only') {
          db.setAllMembersDrawingPermission(meta.room_code, 0);
        } else if (permissions.canva_perm === 'everyone') {
          db.setAllMembersDrawingPermission(meta.room_code, 1);
        }
        if (permissions.chat_perm === 'host_only') {
          db.setAllMembersChatPermission(meta.room_code, 0);
        } else if (permissions.chat_perm === 'everyone') {
          db.setAllMembersChatPermission(meta.room_code, 1);
        }
        if (permissions.instances_perm === 'host_only') {
          db.setAllMembersInstancesPermission(meta.room_code, 0);
        } else if (permissions.instances_perm === 'everyone') {
          db.setAllMembersInstancesPermission(meta.room_code, 1);
        }
        if (permissions.public_work_perm === 'host_only') {
          db.setAllMembersPublicWorkPermission(meta.room_code, 0);
        } else if (permissions.public_work_perm === 'everyone') {
          db.setAllMembersPublicWorkPermission(meta.room_code, 1);
        }
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

    // 16. Save Public Work Screenshot (Local / Private vs Room Public Works)
    case 'save_public_work': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code?.trim().toUpperCase() === meta.user_code?.trim().toUpperCase();
      const members = db.getRoomMembers(meta.room_code);
      const me = members.find(m => m.user_code === meta.user_code);
      const perms = computeUserPermissions(room, me, isHost);
      const isPublic = msg.is_public !== false && msg.is_public !== 0;

      // Saving privately is always allowed for anyone; publishing to public works requires permission
      if (isPublic && !isHost && !perms.can_public_work) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Sharing to public works is currently restricted by the host.'
        }));
      }

      const work = {
        id: msg.id || `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: msg.title || 'Canvas Snapshot',
        author_code: meta.user_code,
        author_name: meta.user_name,
        image_data: msg.image_data,
        is_public: isPublic ? 1 : 0,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      db.savePublicWork(meta.room_code, work);

      if (isPublic) {
        broadcastToRoom(meta.room_code, {
          type: 'new_public_work',
          work,
          public_work: work
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
      } else {
        ws.send(JSON.stringify({
          type: 'new_public_work',
          work,
          public_work: work,
          is_private: true
        }));
      }
      break;
    }

    // 17. Delete Public Work Screenshot (Host or Item Author)
    case 'delete_public_work': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code?.trim().toUpperCase() === meta.user_code?.trim().toUpperCase();
      
      const existing = db.getPublicWorks(meta.room_code, meta.user_code).find(w => w.id === msg.id);
      if (existing && existing.is_public && !isHost) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Restricted: Only the host has permission to delete public works.'
        }));
      }

      db.deletePublicWork(msg.id);
      broadcastToRoom(meta.room_code, {
        type: 'public_work_deleted',
        id: msg.id
      });
      break;
    }

    // 17.1 Delete Milestone / Instance (Host or Author)
    case 'delete_milestone': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code?.trim().toUpperCase() === meta.user_code?.trim().toUpperCase();

      const existing = db.getRoomMilestones(meta.room_code, meta.user_code).find(m => m.id === msg.id);
      if (existing && existing.is_public && !isHost) {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Restricted: Only the host has permission to delete public instances.'
        }));
      }

      db.deleteMilestone(msg.id);
      broadcastToRoom(meta.room_code, {
        type: 'milestone_deleted',
        id: msg.id
      });
      break;
    }

    // 18. Update Instance Snapshot (Sandbox simulation)
    case 'update_instance_snapshot': {
      if (!meta.room_code) return;
      const room = db.getRoom(meta.room_code);
      const isHost = room?.host_user_code?.trim().toUpperCase() === meta.user_code?.trim().toUpperCase();

      if (isHost) {
        // Host sandbox updates the server instance so other members can view it
        db.updateMilestoneHostSandbox(msg.instance_id, msg.snapshot);
        broadcastToRoom(meta.room_code, {
          type: 'instance_snapshot_updated',
          instance_id: msg.instance_id,
          snapshot: msg.snapshot,
          host_sandbox: msg.snapshot
        });
      } else {
        // Member sandboxes are kept private to their account
        ws.send(JSON.stringify({
          type: 'instance_snapshot_updated',
          instance_id: msg.instance_id,
          snapshot: msg.snapshot,
          is_private: true
        }));
      }
      break;
    }

    // 19. Broadcast Instance Show Mode to All Members (Strictly Host / Cohost Only)
    case 'broadcast_instance_show': {
      if (!meta.room_code) return;
      const { isHost, perms } = getMemberPermissions(meta.room_code, meta.user_code);

      if (!isHost && perms.role !== 'cohost') {
        return ws.send(JSON.stringify({
          type: 'error',
          text: 'Restricted: Only the host can broadcast an instance sandbox onto everyone’s canvas.'
        }));
      }

      let snap = msg.snapshot || msg.actions || [];
      if (typeof snap === 'string') {
        try { snap = JSON.parse(snap); } catch(e) { snap = []; }
      }
      if (!Array.isArray(snap)) snap = [];

      broadcastToRoom(meta.room_code, {
        type: 'show_instance_broadcast',
        instance_id: msg.instance_id,
        title: msg.title || 'Sandbox Instance',
        snapshot: snap,
        actions: snap,
        broadcaster_name: meta.user_name
      });
      break;
    }

    // 20. Dismiss Instance Broadcast (Return all members to live room)
    case 'dismiss_instance_broadcast': {
      if (!meta.room_code) return;
      const { isHost, perms } = getMemberPermissions(meta.room_code, meta.user_code);
      if (!isHost && perms.role !== 'cohost') return;

      broadcastToRoom(meta.room_code, {
        type: 'dismiss_instance_broadcast',
        by: meta.user_name
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

  const memberCanDraw = member ? Boolean(member.can_draw === 1 || member.can_draw === true) : false;
  const memberCanChat = member ? Boolean(member.can_chat === 1 || member.can_chat === true) : false;
  const memberCanInstances = member ? Boolean(member.can_instances === 1 || member.can_instances === true) : false;
  const memberCanPublicWork = member ? Boolean(member.can_public_work === 1 || member.can_public_work === true) : false;

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
  const uClean = (userCode || '').trim().toUpperCase();
  const isHost = (room?.host_user_code || '').trim().toUpperCase() === uClean;
  const members = db.getRoomMembers(roomCode);
  const me = members.find(m => (m.user_code || '').trim().toUpperCase() === uClean);
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


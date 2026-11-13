import React, { useState, useEffect, useRef } from 'react';
import Hub from './components/Hub';
import Whiteboard from './components/Whiteboard';
import AccountModal from './components/AccountModal';
import { Bell, Sparkles, X, Check } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('whiteboard_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Restore active session state from sessionStorage or URL on refresh/reload
  const [initialSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem('active_whiteboard_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.room) return parsed;
      }
    } catch (e) {}

    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const offlineParam = params.get('offline');
      const offlineCode = params.get('code');
      if (offlineParam) {
        return {
          room: { code: offlineCode || 'OFFLINE', title: 'Personal Offline Workspace' },
          isOffline: true
        };
      }
      if (roomParam) {
        return {
          room: { code: roomParam.toUpperCase(), title: `Room ${roomParam.toUpperCase()}` },
          isOffline: false
        };
      }
    } catch (e) {}

    return null;
  });

  const [currentView, setCurrentView] = useState(() => initialSession ? 'whiteboard' : 'hub');
  const [activeRoom, setActiveRoom] = useState(() => initialSession?.room || null);
  const [isOfflineBoard, setIsOfflineBoard] = useState(() => Boolean(initialSession?.isOffline));
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(() => !user && !initialSession);
  const [roomInvite, setRoomInvite] = useState(null);
  const [customServerHost, setCustomServerHost] = useState(() => {
    return localStorage.getItem('whiteboard_custom_server') || '';
  });
  const [noticeModal, setNoticeModal] = useState(null); // { title, message, type }
  const [activeSocket, setActiveSocket] = useState(null);

  const showNotice = (title, message, type = 'info') => {
    setNoticeModal({ title, message, type });
  };

  const wsRef = useRef(null);

  // Auto-route on direct URL query params or restored session
  useEffect(() => {
    if (initialSession) {
      const randCode = 'USR-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const defaultUser = user || { user_code: randCode, name: 'User', avatar_color: '#3b82f6' };
      if (!user) {
        setUser(defaultUser);
        try { localStorage.setItem('whiteboard_user', JSON.stringify(defaultUser)); } catch(e){}
      }
      setIsAccountModalOpen(false);

      if (!initialSession.isOffline && initialSession.room?.code) {
        handleJoinDirect(initialSession.room.code);
      } else {
        handleOpenBoard({
          room: initialSession.room,
          isOffline: true
        });
      }
    }
  }, []);

  // ── WEBSOCKET CONNECTION, RESILIENT RECONNECT & USER PRESENCE ──────
  useEffect(() => {
    if (!user?.user_code) return;

    let isSubscribed = true;
    let reconnectTimeout = null;
    let pingInterval = null;
    let currentSocket = null;

    const connect = () => {
      if (!isSubscribed) return;

      let wsUrl = '';
      const isLoadedFromLanHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (customServerHost && !isLoadedFromLanHost) {
        const cleanHost = customServerHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const isHttps = customServerHost.startsWith('https://');
        wsUrl = `${isHttps ? 'wss:' : 'ws:'}//${cleanHost}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        wsUrl = `${protocol}//${host}`;
      }

      try {
        const socket = new WebSocket(wsUrl);
        currentSocket = socket;
        wsRef.current = socket;

        socket.onopen = () => {
          if (!isSubscribed) {
            socket.close();
            return;
          }
          setActiveSocket(socket);

          // Identify user on server
          socket.send(JSON.stringify({
            type: 'identify',
            user_code: user.user_code,
            user_name: user.name,
            avatar_color: user.avatar_color
          }));

          // Start client-side keepalive ping every 20 seconds
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
          }, 20000);
        };

        socket.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'room_invite') {
              setRoomInvite(msg);
            }
          } catch (err) {
            console.error(err);
          }
        };

        socket.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (isSubscribed) {
            setActiveSocket(null);
            // Auto-reconnect with 1.5s delay
            reconnectTimeout = setTimeout(connect, 1500);
          }
        };

        socket.onerror = () => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        };
      } catch (err) {
        console.warn('[!] WebSocket init error:', err);
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      }
    };

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (currentSocket && (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)) {
        currentSocket.close();
      }
      setActiveSocket(null);
    };
  }, [user, customServerHost]);

  const handleSaveUser = (userData) => {
    setUser(userData);
    localStorage.setItem('whiteboard_user', JSON.stringify(userData));
    setIsAccountModalOpen(false);
  };

  const handleOpenBoard = ({ room, isOffline = false }) => {
    setActiveRoom(room);
    setIsOfflineBoard(isOffline);
    setCurrentView('whiteboard');
    try {
      sessionStorage.setItem('active_whiteboard_session', JSON.stringify({ room, isOffline }));
      const cleanUrl = isOffline
        ? `${window.location.pathname}?offline=true${room?.code && room.code !== 'OFFLINE' ? `&code=${room.code}` : ''}`
        : `${window.location.pathname}?room=${room.code}`;
      window.history.replaceState(null, '', cleanUrl);
    } catch (e) {}
  };

  const handleBackToHub = () => {
    try {
      sessionStorage.removeItem('active_whiteboard_session');
      window.history.replaceState(null, '', window.location.pathname);
    } catch (e) {}
    setCurrentView('hub');
    setActiveRoom(null);
    setIsOfflineBoard(false);
  };

  const handleJoinDirect = async (code, customHost = null) => {
    try {
      let cleanCode = code ? code.trim() : '';
      if (!cleanCode) return;

      let extractedHost = null;

      // Detect if user pasted a full URL or direct IP (e.g. 10.36.112.55:5000 or https://...loca.lt)
      if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
        try {
          const parsed = new URL(cleanCode);
          extractedHost = parsed.origin;
          const qRoom = parsed.searchParams.get('room');
          if (qRoom) {
            cleanCode = qRoom.toUpperCase();
          } else {
            const pParts = parsed.pathname.split('/').filter(Boolean);
            if (pParts.length > 0 && pParts[0].length === 4) {
              cleanCode = pParts[0].toUpperCase();
            }
          }
        } catch (e) {}
      } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(cleanCode)) {
        const parts = cleanCode.split('/');
        extractedHost = `http://${parts[0]}`;
        cleanCode = parts[1] && parts[1].length === 4 ? parts[1].toUpperCase() : '';
      } else {
        cleanCode = cleanCode.toUpperCase();
      }

      const isLoadedFromLanHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      let hostToUse = extractedHost || customHost || (isLoadedFromLanHost ? '' : customServerHost);
      let baseUrl = hostToUse
        ? (hostToUse.startsWith('http') ? hostToUse : `http://${hostToUse}`).replace(/\/$/, '')
        : '';

      let roomFound = null;

      // Layer 1: Query designated host or local node server
      if (cleanCode) {
        try {
          const res = await fetch(`${baseUrl}/api/rooms/${cleanCode}`, {
            headers: { 'Bypass-Tunnel-Reminder': 'true' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.room) roomFound = data.room;
          }
        } catch (err) {}
      }

      // Layer 2: Cloud / Cross-Network Global Registry Lookup (for "With Internet" across any network)
      if (!roomFound && cleanCode && !extractedHost && !customHost) {
        try {
          const resolveRes = await fetch(`/api/rooms/resolve/${cleanCode}`);
          if (resolveRes.ok) {
            const resolveData = await resolveRes.json();
            if (resolveData.found && resolveData.room) {
              roomFound = resolveData.room;
              if (resolveData.url) {
                setCustomServerHost(resolveData.url);
                localStorage.setItem('whiteboard_custom_server', resolveData.url);
              }
            }
          }
        } catch (e) {}

        // Direct client fallback to ntfy.sh if backend failed to reach internet
        if (!roomFound) {
          try {
            const ntfyRes = await fetch(`https://ntfy.sh/wb-room-${cleanCode.toLowerCase()}/json?poll=1&since=24h`);
            if (ntfyRes.ok) {
              const text = await ntfyRes.text();
              const lines = text.trim().split('\n').filter(Boolean);
              for (let i = lines.length - 1; i >= 0; i--) {
                try {
                  const item = JSON.parse(lines[i]);
                  const payload = typeof item.message === 'string' ? JSON.parse(item.message) : item.message;
                  if (payload && payload.url) {
                    const targetUrl = payload.url.replace(/\/$/, '');
                    const remoteRes = await fetch(`${targetUrl}/api/rooms/${cleanCode}`, {
                      headers: { 'Bypass-Tunnel-Reminder': 'true' }
                    });
                    if (remoteRes.ok) {
                      const remoteData = await remoteRes.json();
                      if (remoteData.room) {
                        roomFound = remoteData.room;
                        setCustomServerHost(targetUrl);
                        localStorage.setItem('whiteboard_custom_server', targetUrl);
                        break;
                      }
                    }
                  }
                } catch (pe) {}
              }
            }
          } catch (ne) {}
        }
      }

      // Layer 3: UDP LAN Discovery (for "Without Internet" / Same Wi-Fi or Hotspot)
      if (!roomFound && cleanCode && !extractedHost && !customHost) {
        try {
          const scanRes = await fetch('/api/lan/scan');
          if (scanRes.ok) {
            const scanData = await scanRes.json();
            if (scanData.discovered && scanData.discovered.length > 0) {
              for (const hostItem of scanData.discovered) {
                if (hostItem.rooms && hostItem.rooms.some(r => r.code === cleanCode)) {
                  const targetUrl = hostItem.url.replace(/\/$/, '');
                  const remoteRes = await fetch(`${targetUrl}/api/rooms/${cleanCode}`, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                  });
                  if (remoteRes.ok) {
                    const remoteData = await remoteRes.json();
                    if (remoteData.room) {
                      roomFound = remoteData.room;
                      setCustomServerHost(targetUrl);
                      localStorage.setItem('whiteboard_custom_server', targetUrl);
                      break;
                    }
                  }
                }
              }
            }
          }
        } catch (scanErr) {}
      }

      // Layer 4: Rapid Subnet HTTP Probe (Fallback for Wi-Fi routers blocking UDP broadcast)
      if (!roomFound && cleanCode && !extractedHost && !customHost) {
        try {
          const probeRes = await fetch(`/api/lan/find-room/${cleanCode}`);
          if (probeRes.ok) {
            const probeData = await probeRes.json();
            if (probeData.found && probeData.room && probeData.url) {
              roomFound = probeData.room;
              setCustomServerHost(probeData.url);
              localStorage.setItem('whiteboard_custom_server', probeData.url);
            }
          }
        } catch (pe) {}
      }

      if (!roomFound) {
        showNotice(
          'Room Not Found',
          `Room "${cleanCode || 'Unknown'}" could not be located.\n\n` +
          `• WITH INTERNET: Verify the 4-letter room code or ask the host for their Public Share Link.\n` +
          `• WITHOUT INTERNET: Ensure both devices are connected to the exact same Wi-Fi router or Mobile Hotspot.`,
          'warning'
        );
        return;
      }

      // Save to user's joined rooms history
      try {
        const stored = JSON.parse(localStorage.getItem('my_joined_rooms') || '[]');
        if (!stored.some(r => r.code === roomFound.code)) {
          const updated = [{ code: roomFound.code, title: roomFound.title, host_name: roomFound.host_name, joined_at: new Date().toISOString() }, ...stored];
          localStorage.setItem('my_joined_rooms', JSON.stringify(updated.slice(0, 20)));
        }
      } catch (e) {}

      // Log user activity to SQLite
      try {
        fetch('/api/user/log-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_code: user?.user_code || 'GUEST',
            room_code: roomFound.code,
            action_type: 'JOIN_ROOM',
            details: `Joined session "${roomFound.title}"`
          })
        }).catch(() => {});
      } catch (e) {}

      const finalHost = extractedHost || customHost;
      if (finalHost) {
        setCustomServerHost(finalHost);
        localStorage.setItem('whiteboard_custom_server', finalHost);
      }

      handleOpenBoard({ room: roomFound, isOffline: false });
    } catch (err) {
      showNotice('Connection Error', `Could not join room: ${err.message}`, 'error');
    }
  };

  const acceptInvite = () => {
    if (!roomInvite) return;
    handleJoinDirect(roomInvite.room_code);
    setRoomInvite(null);
  };

  return (
    <div className={`w-screen h-screen font-sans ${currentView === 'hub' ? 'overflow-y-auto bg-slate-50' : 'overflow-hidden'}`}>
      {/* Real-time Push Invite Notification Toast */}
      {roomInvite && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 max-w-sm animate-fade-in flex flex-col gap-2.5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600">
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              <div>
                <h4 className="font-bold text-xs">Whiteboard Invitation!</h4>
                <p className="text-[11px] text-slate-300">Host {roomInvite.host_name} added you:</p>
              </div>
            </div>
            <button onClick={() => setRoomInvite(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2.5 bg-slate-800 rounded-xl text-xs flex justify-between items-center">
            <span className="font-semibold text-blue-200 line-clamp-1">{roomInvite.room_title}</span>
            <span className="font-mono font-bold text-[11px] text-yellow-300">{roomInvite.room_code}</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setRoomInvite(null)}
              className="px-3 py-1 text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
            <button
              onClick={acceptInvite}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              Join Session
            </button>
          </div>
        </div>
      )}

      {/* Main View Router */}
      {currentView === 'hub' ? (
        <Hub
          user={user}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          onOpenBoard={handleOpenBoard}
          onJoinRoom={handleJoinDirect}
          showNotice={showNotice}
        />
      ) : (
        <Whiteboard
          room={activeRoom}
          user={user}
          onBackToHub={handleBackToHub}
          ws={isOfflineBoard ? null : activeSocket}
          isOffline={isOfflineBoard}
        />
      )}

      {/* Account Profile & Creation Modal */}
      {isAccountModalOpen && (
        <AccountModal
          user={user}
          onSave={handleSaveUser}
          onClose={user ? () => setIsAccountModalOpen(false) : null}
          isEditing={Boolean(user)}
        />
      )}

      {/* Branded In-App Notice Modal (Eliminates browser 'localhost:5000 says' alerts) */}
      {noticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="WB Logo" className="w-9 h-9 object-contain rounded-lg border border-slate-100 p-0.5" />
                <div>
                  <h3 className="font-bold text-base text-slate-900">{noticeModal.title || 'Collaborative Whiteboard'}</h3>
                  <p className="text-xs text-slate-500 font-medium">Real-Time Workspace</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-5">
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">{noticeModal.message}</p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setNoticeModal(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-sm transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


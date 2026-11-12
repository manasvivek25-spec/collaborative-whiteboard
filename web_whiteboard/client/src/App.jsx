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

  const [currentView, setCurrentView] = useState('hub'); // 'hub' | 'whiteboard'
  const [activeRoom, setActiveRoom] = useState(null);
  const [isOfflineBoard, setIsOfflineBoard] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(!user);
  const [roomInvite, setRoomInvite] = useState(null);
  const [customServerHost, setCustomServerHost] = useState(() => {
    return localStorage.getItem('whiteboard_custom_server') || '';
  });
  const [noticeModal, setNoticeModal] = useState(null); // { title, message, type }

  const showNotice = (title, message, type = 'info') => {
    setNoticeModal({ title, message, type });
  };

  const wsRef = useRef(null);

  // Auto-route on direct URL query params (?room=CODE or ?offline=true)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const offlineParam = params.get('offline');
    if (offlineParam) {
      const defaultUser = user || { user_code: 'U_DEMO', name: 'Manas Vivek', avatar_color: '#3b82f6' };
      if (!user) {
        setUser(defaultUser);
        try { localStorage.setItem('whiteboard_user', JSON.stringify(defaultUser)); } catch(e){}
      }
      setIsAccountModalOpen(false);
      handleOpenBoard({
        room: { code: 'OFFLINE', title: 'Personal Offline Workspace' },
        isOffline: true
      });
    } else if (roomParam) {
      const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const defaultUser = user || { user_code: `USR-${randSuffix}`, name: `Collaborator ${randSuffix}`, avatar_color: '#10b981' };
      if (!user) {
        setUser(defaultUser);
        try { localStorage.setItem('whiteboard_user', JSON.stringify(defaultUser)); } catch(e){}
      }
      setIsAccountModalOpen(false);
      handleJoinDirect(roomParam);
    }
  }, []);

  // ── WEBSOCKET CONNECTION & USER PRESENCE ───────────────────────────
  useEffect(() => {
    if (!user?.user_code) return;

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

    let socket = null;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'identify',
          user_code: user.user_code,
          user_name: user.name,
          avatar_color: user.avatar_color
        }));
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
    } catch (err) {
      console.error('[!] WebSocket connection error:', err);
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
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
  };

  const handleJoinDirect = async (code, customHost = null) => {
    try {
      let cleanCode = code ? code.trim() : '';
      if (!cleanCode) return;

      let extractedHost = null;

      // Detect if user pasted a full URL (e.g., https://xxx.loca.lt?room=DR5F or http://10.36.112.55:5000)
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
      } else {
        cleanCode = cleanCode.toUpperCase();
      }

      const isLoadedFromLanHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      let hostToUse = extractedHost || customHost || (isLoadedFromLanHost ? '' : customServerHost);
      let baseUrl = hostToUse
        ? (hostToUse.startsWith('http') ? hostToUse : `http://${hostToUse}`).replace(/\/$/, '')
        : '';

      let roomFound = null;

      // 1. Try designated host/server first
      try {
        const res = await fetch(`${baseUrl}/api/rooms/${cleanCode}`, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.room) {
            roomFound = data.room;
          }
        }
      } catch (err) {
        // Query failed, proceed to auto-scan LAN
      }

      // 2. If not found and no specific custom host was forced, search LAN hosts via UDP
      if (!roomFound && !extractedHost && !customHost) {
        try {
          const scanRes = await fetch('/api/lan/scan');
          if (scanRes.ok) {
            const scanData = await scanRes.json();
            if (scanData.discovered && scanData.discovered.length > 0) {
              for (const hostItem of scanData.discovered) {
                if (hostItem.rooms && hostItem.rooms.some(r => r.code === cleanCode)) {
                  // Found the room on this LAN host!
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
        } catch (scanErr) {
          console.warn('[Auto LAN Discovery note]:', scanErr);
        }
      }

      if (!roomFound) {
        showNotice(
          'Room Not Found',
          `Room "${cleanCode}" could not be located.\n\n` +
          `• WITHOUT INTERNET: Ensure both laptops are connected to the exact same Wi-Fi router or Mobile Hotspot.\n` +
          `• WITH INTERNET: Ask your host for their Public Share Link (or paste their public link here).`,
          'warning'
        );
        return;
      }

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
          onBackToHub={() => setCurrentView('hub')}
          ws={isOfflineBoard ? null : wsRef.current}
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


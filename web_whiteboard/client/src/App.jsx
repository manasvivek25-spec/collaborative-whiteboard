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

  const wsRef = useRef(null);

  // ── WEBSOCKET CONNECTION & USER PRESENCE ───────────────────────────
  useEffect(() => {
    if (!user?.user_code) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // In Vite dev mode, port 3000 proxies /ws to 5000, or directly connect to 5000
    const wsUrl = process.env.NODE_ENV === 'production'
      ? `${protocol}//${host}`
      : `ws://${window.location.hostname}:5000`;

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
            // Push invitation received from Host
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
  }, [user]);

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

  const handleJoinDirect = async (code) => {
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      if (!res.ok || !data.room) throw new Error(data.error || 'Room not found');

      handleOpenBoard({ room: data.room, isOffline: false });
    } catch (err) {
      alert(`Could not join room: ${err.message}`);
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
    </div>
  );
}


import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Wifi,
  Plus,
  Users,
  Search,
  Copy,
  Check,
  Bell,
  Sparkles,
  ArrowRight,
  User,
  Shield,
  Layers,
  FileText,
  Clock,
  Play,
  Upload,
  Trash2,
  Monitor,
  Download
} from 'lucide-react';
import PromptModal from './PromptModal';

export default function Hub({
  user,
  onOpenAccountModal,
  onOpenBoard,
  onJoinRoom,
  showNotice
}) {
  const [currentTab, setCurrentTab] = useState('group'); // 'group' | 'personal'
  const [searchQuery, setSearchQuery] = useState('');
  const [enrolledRooms, setEnrolledRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [personalBoards, setPersonalBoards] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCustomHostInput, setShowCustomHostInput] = useState(false);
  const [customHostInput, setCustomHostInput] = useState('');
  const [lanModalData, setLanModalData] = useState(null);
  const [copiedLanUrl, setCopiedLanUrl] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPersonalBoardPrompt, setShowPersonalBoardPrompt] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [isScanningLan, setIsScanningLan] = useState(false);
  const [discoveredLanRooms, setDiscoveredLanRooms] = useState([]);
  const [subnetVerification, setSubnetVerification] = useState(null);
  const [netInfo, setNetInfo] = useState(null);
  const fileInputRef = useRef(null);

  // Detect standalone app mode & PWA install prompts
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    ) {
      setIsStandaloneApp(true);
    }
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallAppClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsStandaloneApp(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowAppModal(true);
    }
  };

  // Load user's enrolled rooms from database & localStorage personal boards
  useEffect(() => {
    fetchRooms();
    loadPersonalBoards();
    fetchNetworkInfo();
    handleScanLan(true); // Silent scan on mount
    const timer = setInterval(() => {
      handleScanLan(true); // Silent background auto-discovery
    }, 8000);
    return () => clearInterval(timer);
  }, [user]);

  const fetchNetworkInfo = async () => {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data = await res.json();
        setNetInfo(data);
      }
    } catch (e) {
      console.warn('[Network Info note]:', e);
    }
  };

  const fetchRooms = async () => {
    if (!user?.user_code) return;
    try {
      const [enrolledRes, publicRes] = await Promise.all([
        fetch(`/api/user/${user.user_code}/rooms`),
        fetch('/api/rooms')
      ]);
      const enrolledData = await enrolledRes.json();
      const publicData = await publicRes.json();

      if (enrolledData.success) setEnrolledRooms(enrolledData.rooms || []);
      if (publicData.success) setPublicRooms(publicData.rooms || []);
    } catch (err) {
      console.error('[!] Error loading rooms:', err);
    }
  };

  const loadPersonalBoards = () => {
    try {
      const saved = localStorage.getItem('personal_whiteboards');
      if (saved) setPersonalBoards(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  };

  const savePersonalBoards = (boards) => {
    setPersonalBoards(boards);
    localStorage.setItem('personal_whiteboards', JSON.stringify(boards));
  };

  const handleCreatePersonalBoard = () => {
    setShowPersonalBoardPrompt(true);
  };

  const handleConfirmCreatePersonalBoard = (title) => {
    const finalTitle = (title || '').trim() || `My Workspace #${personalBoards.length + 1}`;
    const newBoard = {
      id: `pers_${Date.now()}`,
      title: finalTitle,
      created_at: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      actions: []
    };
    const updated = [newBoard, ...personalBoards];
    savePersonalBoards(updated);
    onOpenBoard({ room: { code: newBoard.id, title: newBoard.title }, isOffline: true });
  };

  const handleImportWhiteboard = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const importedActions = data.actions || (Array.isArray(data) ? data : []);
        const importedMilestones = data.milestones || [];
        const rawTitle = data.title || file.name.replace(/\.[^/.]+$/, "");
        const newBoard = {
          id: `pers_import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: `${rawTitle} (Local Copy)`,
          created_at: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          actions: importedActions,
          milestones: importedMilestones
        };

        // Persist offline actions & milestones locally
        localStorage.setItem(`offline_actions_${newBoard.id}`, JSON.stringify(importedActions));
        if (importedMilestones.length > 0) {
          localStorage.setItem(`offline_milestones_${newBoard.id}`, JSON.stringify(importedMilestones));
        }
        const updated = [newBoard, ...personalBoards];
        savePersonalBoards(updated);

        e.target.value = '';

        if (showNotice) {
          showNotice(
            'Import Successful',
            `Successfully imported "${newBoard.title}" with ${importedMilestones.length} saved instances into Personal Space!\n\nThis board is completely local on your device and will NOT interfere with any live collaborative session.`,
            'success'
          );
        }
        onOpenBoard({ room: { code: newBoard.id, title: newBoard.title, actions: importedActions, milestones: importedMilestones }, isOffline: true });
      } catch (err) {
        if (showNotice) {
          showNotice('Import Error', 'Invalid whiteboard package file: ' + err.message, 'error');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDeletePersonalBoard = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Delete this local personal board?')) {
      const updated = personalBoards.filter(b => b.id !== id);
      savePersonalBoards(updated);
      localStorage.removeItem(`offline_actions_${id}`);
    }
  };

  const handleCreateGroupRoom = async (mode) => {
    const defaultTitles = {
      cloud: 'Internet Collaborative Whiteboard',
      hotspot: 'LAN Offline Whiteboard'
    };
    const title = defaultTitles[mode] || 'Team Whiteboard';

    setLoading(true);
    try {
      let netInfo = null;
      try {
        const netRes = await fetch('/api/network-info');
        if (netRes.ok) netInfo = await netRes.json();
      } catch (e) {
        console.warn('Network info unavailable:', e);
      }

      let createdRoom = null;
      try {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            hostUserCode: user?.user_code || 'GUEST',
            hostName: user?.name || 'User',
            isPublic: true,
            networkMode: mode
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.room) createdRoom = data.room;
        }
      } catch (e) {
        console.warn('Backend room creation note, using local room:', e);
      }

      if (!createdRoom) {
        const randCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        createdRoom = {
          code: randCode,
          title: title.trim(),
          host_user_code: user?.user_code || 'GUEST',
          host_name: user?.name || 'User',
          created_at: new Date().toISOString()
        };
      }

      if (mode === 'cloud') {
        // Mode 1: With Internet (Public Tunnel for Any Network Worldwide)
        let publicTunnelUrl = null;
        try {
          const tRes = await fetch('/api/internet/start-tunnel', { method: 'POST' });
          if (tRes.ok) {
            const tData = await tRes.json();
            if (tData.public_url) publicTunnelUrl = tData.public_url;
          }
        } catch (tErr) {
          console.warn('[Internet Mode] Tunnel notice:', tErr);
        }

        const shareUrl = publicTunnelUrl ? `${publicTunnelUrl}?room=${createdRoom.code}` : `http://${window.location.host}?room=${createdRoom.code}`;

        setLanModalData({
          mode: 'internet',
          title: createdRoom.title,
          code: createdRoom.code,
          publicUrl: shareUrl,
          rawTunnelUrl: publicTunnelUrl,
          room: createdRoom
        });
      } else {
        // Mode 2: Without Internet (Pure LAN / Hotspot, Zero Internet Required)
        const adapters = netInfo?.adapters || [];
        const primary = netInfo?.primary_adapter || adapters[0] || {
          interface: 'Wi-Fi / Hotspot',
          type: 'Wi-Fi / Hotspot',
          ip: netInfo?.primary_ip || window.location.hostname || '192.168.43.1',
          subnet: netInfo?.subnet || 'Local Subnet',
          url: `http://${netInfo?.primary_ip || window.location.hostname || '192.168.43.1'}:5000`
        };

        setLanModalData({
          mode: 'hotspot',
          title: createdRoom.title,
          code: createdRoom.code,
          adapters,
          selectedAdapter: primary,
          room: createdRoom
        });
      }
    } catch (err) {
      if (showNotice) {
        showNotice('Creation Error', `Could not create session: ${err.message}`, 'error');
      } else {
        console.error('Room creation error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScanLan = async (silent = false) => {
    if (!silent) setIsScanningLan(true);
    try {
      const res = await fetch('/api/lan/scan');
      const data = await res.json();
      if (data.success && data.discovered) {
        setDiscoveredLanRooms(data.discovered);
        if (!silent && data.discovered.length === 0) {
          if (showNotice) {
            showNotice(
              'No Sessions Discovered on LAN',
              'No active whiteboard sessions discovered on your local network yet.\n\nMake sure your partner has clicked "2. Without Internet" and both devices are connected to the exact same Wi-Fi router or Mobile Hotspot.',
              'info'
            );
          }
        }
      }
    } catch (err) {
      if (!silent && showNotice) {
        showNotice('LAN Scan Error', 'Could not scan LAN: ' + err.message, 'error');
      }
    } finally {
      if (!silent) setIsScanningLan(false);
    }
  };

  const handleCustomHostChange = async (val) => {
    setCustomHostInput(val);
    const trimmed = val.trim();
    if (!trimmed || trimmed.length < 7) {
      setSubnetVerification(null);
      return;
    }
    try {
      const res = await fetch('/api/lan/verify-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: trimmed })
      });
      const data = await res.json();
      setSubnetVerification(data);
    } catch (e) {
      setSubnetVerification(null);
    }
  };

  const handleJoinDirect = (code, customHost = null) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    onJoinRoom(clean, (customHost || customHostInput).trim() || null);
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filter lists
  const filteredEnrolled = enrolledRooms.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPersonal = personalBoards.filter(b => 
    b.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        {/* Left Brand */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" className="w-9 h-9 rounded-xl object-contain shadow-sm bg-white p-0.5 border border-slate-200" alt="Whiteboard Logo" />
          <div>
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight flex items-center gap-2">
              Whiteboard Logs & Workspace
            </h1>
            <p className="text-[11px] text-slate-500">Cross-Network &bull; Mobile &bull; Wi-Fi &bull; LAN</p>
          </div>
        </div>

        {/* Center Search */}
        <div className="hidden md:flex items-center gap-2 max-w-sm w-full mx-6">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search whiteboard by title or code..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        {/* Right User Profile Capsule & App Button */}
        <div className="flex items-center gap-2.5">
          {!isStandaloneApp && (
            <button
              onClick={handleInstallAppClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition hover:scale-[1.02] active:scale-[0.98]"
              title="Launch or Install as Standalone System App"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop App</span>
              <span className="sm:hidden">App</span>
            </button>
          )}

          <div
            onClick={onOpenAccountModal}
            className="flex items-center gap-2.5 p-1.5 pr-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl cursor-pointer transition"
          >
            <div
              style={{ backgroundColor: user?.avatar_color || '#2563eb' }}
              className="w-7 h-7 rounded-lg text-white flex items-center justify-center font-bold text-xs shadow-sm"
            >
              {user?.name?.slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800">{user?.name || 'User'}</p>
              <p className="text-[10px] text-blue-600 font-mono font-bold">{user?.user_code || 'GUEST'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Capsule Switcher (Group First, then Personal) */}
      <div className="flex justify-center py-5">
        <div className="p-1 bg-slate-200 rounded-2xl flex items-center shadow-inner">
          <button
            onClick={() => setCurrentTab('group')}
            className={`px-8 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              currentTab === 'group'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            Group Whiteboards
          </button>
          <button
            onClick={() => setCurrentTab('personal')}
            className={`px-8 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              currentTab === 'personal'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Personal Space
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pb-12">
        {currentTab === 'group' ? (
          <div className="space-y-8">
            {/* Section 1: Hosting Options */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-base font-bold text-slate-900">Host a Whiteboard</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-5">
                Start a live session for your team:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option 1: Cloud & Internet Mode */}
                <div className="p-5 rounded-2xl border border-blue-100 bg-blue-50/30 flex flex-col justify-between hover:shadow-xs transition">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
                        <Globe className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                        Worldwide
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">1. With Internet</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Connect across mobile data (4G/5G), home Wi-Fi, or remote networks globally.
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleCreateGroupRoom('cloud')}
                    className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Host on Internet
                  </button>
                </div>

                {/* Option 2: Without Internet (Direct Hotspot) */}
                <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/30 flex flex-col justify-between hover:shadow-xs transition">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                        <Wifi className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                        Local Only
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">2. Without Internet</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Peer-to-peer over your local Wi-Fi router or Mobile Hotspot with zero internet needed.
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleCreateGroupRoom('hotspot')}
                    className="mt-5 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Host on Local LAN
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Join Active Room */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Join Whiteboard</h3>
                  <p className="text-xs text-slate-500">Enter 4-letter room code or paste invite link:</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    placeholder="Room Code (e.g. DR5F) or Link"
                    className="w-full sm:w-64 px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleJoinDirect(joinCodeInput)}
                    className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
                  >
                    <span>Join Room</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={isScanningLan}
                    onClick={() => handleScanLan(false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
                    title="Automatically find active whiteboard sessions on the same Wi-Fi / Hotspot"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{isScanningLan ? 'Scanning LAN...' : '📡 Scan Same LAN'}</span>
                  </button>
                </div>
              </div>

              {/* Discovered Rooms on Same LAN */}
              {(() => {
                const validDiscoveredLanRooms = discoveredLanRooms.filter(item => {
                  const isSelfIp = item.ip === '127.0.0.1' ||
                                   item.ip === 'localhost' ||
                                   item.ip === window.location.hostname ||
                                   item.ip === netInfo?.primary_ip ||
                                   (netInfo?.adapters || []).some(a => a.ip === item.ip);
                  return !isSelfIp;
                }).map(item => {
                  const validRooms = (item.rooms || []).filter(room => {
                    const isMyRoom = room.host_user_code === user?.user_code;
                    return !isMyRoom;
                  });
                  return { ...item, rooms: validRooms };
                }).filter(item => item.rooms.length > 0);

                if (validDiscoveredLanRooms.length === 0) return null;

                return (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Active Whiteboards Discovered on Same LAN Subnet:
                      </p>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                        Zero Internet
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {validDiscoveredLanRooms.map(item => (
                        item.rooms.map(room => (
                          <div key={`${item.ip}-${room.code}`} className="p-3 bg-white border border-emerald-200 rounded-xl flex items-center justify-between shadow-2xs hover:border-emerald-400 transition">
                            <div>
                              <p className="text-xs font-bold text-slate-900">{room.title}</p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Room Code: <strong className="text-blue-600 font-extrabold">{room.code}</strong> &bull; Host: {room.host_name}
                              </p>
                              <p className="text-[10px] text-emerald-700 font-mono">
                                LAN IP: {item.ip}:{item.port}
                              </p>
                            </div>
                            <button
                              onClick={() => handleJoinDirect(room.code, item.url)}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0"
                            >
                              Join Now
                            </button>
                          </div>
                        ))
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Expandable Custom LAN / Hotspot IP Option for Joiner */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomHostInput(!showCustomHostInput)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5 transition self-start"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{showCustomHostInput ? '▲ Hide Custom Host / Public Tunnel Options' : '▼ Connect via Custom Host / Public Tunnel URL (e.g., https://...loca.lt or 192.168.1.15:5000)'}</span>
                </button>

                {showCustomHostInput && (
                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 flex flex-col gap-2.5 animate-fade-in">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="flex-1 w-full">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Host Server IP & Port (e.g., 10.36.112.55:5000 or 192.168.43.1:5000):
                        </label>
                        <input
                          type="text"
                          value={customHostInput}
                          onChange={(e) => handleCustomHostChange(e.target.value)}
                          placeholder="10.36.112.55:5000"
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 max-w-xs">
                        Join another device's Mobile Hotspot or LAN session without active internet.
                      </span>
                    </div>

                    {/* Subnet Verification Feedback */}
                    {subnetVerification && (
                      <div className={`p-2.5 rounded-lg text-xs font-medium flex items-start gap-2 ${
                        subnetVerification.sameSubnet
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {subnetVerification.sameSubnet ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                            <span><strong>Same LAN Confirmed:</strong> Target IP {subnetVerification.targetIp} is on your exact local network ({subnetVerification.matchedAdapter}).</span>
                          </>
                        ) : (
                          <>
                            <span className="text-base shrink-0 leading-none">⚠️</span>
                            <span><strong>Subnet Mismatch Warning:</strong> Host IP {subnetVerification.targetIp} is NOT on your active local subnets ({subnetVerification.localSubnets.join(', ')}). Please verify both devices are on the exact same Wi-Fi / Hotspot.</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Google Classroom Saved Group Whiteboards */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Saved Group Whiteboards (Classroom Sessions)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sessions you joined or created. Click any board to re-enter with the latest synchronized state:
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500">{filteredEnrolled.length} Boards</span>
              </div>

              {filteredEnrolled.length === 0 ? (
                <div className="p-10 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
                  <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No group whiteboards joined yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    When you create a room or when a host adds you by your Account Code ({user?.user_code}), it appears here automatically!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredEnrolled.map((r) => (
                    <div
                      key={r.code}
                      className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{r.title}</h4>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[11px] font-bold rounded">
                            {r.code}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-slate-500">
                          <p>Host: <span className="font-semibold text-slate-700">{r.host_name}</span></p>
                          <p>Members: <span className="font-semibold text-slate-700">{r.member_count || 1} enrolled</span></p>
                          <p className="text-[11px] text-slate-400">Updated: {r.updated_at}</p>
                        </div>
                      </div>

                      <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => copyCode(r.code)}
                          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold"
                        >
                          {copiedCode === r.code ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCode === r.code ? 'Copied' : 'Code'}
                        </button>
                        <button
                          onClick={() => handleJoinDirect(r.code)}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          Rejoin
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Personal Workspace Tab */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  Your Personal Whiteboards (Offline & Private)
                </h3>
                <p className="text-xs text-slate-500">
                  Private boards saved locally on this device. Completely isolated from group sessions:
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportWhiteboard}
                  accept=".whiteboard,.json"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Whiteboard
                </button>
                <button
                  onClick={handleCreatePersonalBoard}
                  className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Board
                </button>
              </div>
            </div>

            {filteredPersonal.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-700">No personal whiteboards yet</p>
                <p className="text-xs text-slate-400 mt-1">Create an offline personal board or import a .whiteboard package file.</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import File
                  </button>
                  <button
                    onClick={handleCreatePersonalBoard}
                    className="px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Board
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPersonal.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{b.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Created: {b.created_at}</p>
                    </div>

                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={(e) => handleDeletePersonalBoard(b.id, e)}
                        title="Delete Personal Board"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onOpenBoard({ room: { code: b.id, title: b.title }, isOffline: true })}
                        className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Open Board
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── CONNECTION INFO MODAL (DUAL MODE: WITH INTERNET vs WITHOUT INTERNET) ── */}
      {lanModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-scale-up">
            {lanModalData.mode === 'internet' ? (
              /* Mode 1: With Internet (Public Cross-Network Tunnel) */
              <>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl text-white bg-blue-600 shadow-xs">
                      <Globe className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        🌐 Public Internet Whiteboard Active
                      </h3>
                      <p className="text-xs text-slate-500">Cross-Network Worldwide &bull; Any Wi-Fi, 4G/5G Cellular & Broadband</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    Internet Active
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400">4-Letter Room Code</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xl font-mono font-extrabold text-blue-600 tracking-wider">
                        {lanModalData.code}
                      </span>
                      <button
                        onClick={() => copyCode(lanModalData.code)}
                        className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 shadow-2xs"
                      >
                        {copiedCode === lanModalData.code ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode === lanModalData.code ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200">
                    <span className="text-[10px] uppercase font-bold text-blue-700">
                      Public Share Link (For Collaborators on ANY Network)
                    </span>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-xs font-mono font-bold text-blue-900 truncate">
                        {lanModalData.publicUrl}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lanModalData.publicUrl);
                          setCopiedPublicUrl(true);
                          setTimeout(() => setCopiedPublicUrl(false), 2000);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs shrink-0"
                      >
                        {copiedPublicUrl ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPublicUrl ? 'Copied Link' : 'Copy Link'}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 font-medium px-1">
                    Share this link or room code with your teammates to collaborate in real-time from any network.
                  </p>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        const room = lanModalData.room;
                        setLanModalData(null);
                        onOpenBoard({ room, isOffline: false });
                      }}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                    >
                      <span>Enter Whiteboard Session</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Mode 2: Without Internet (Zero Internet LAN / Hotspot) */
              <>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl text-white bg-emerald-600 shadow-xs">
                      <Wifi className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        ⚡ Direct LAN / Hotspot Whiteboard Active
                      </h3>
                      <p className="text-xs text-slate-500">Airtight Same-LAN Connection &bull; Zero Internet Required</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                    Zero Internet
                  </span>
                </div>

                <div className="space-y-3.5">
                  {/* If multiple verified physical LAN adapters exist, let host choose */}
                  {lanModalData.adapters && lanModalData.adapters.length > 1 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Active Physical Network Adapter:</span>
                      <div className="flex flex-wrap gap-2">
                        {lanModalData.adapters.map(ad => (
                          <button
                            key={ad.ip}
                            onClick={() => setLanModalData(prev => ({ ...prev, selectedAdapter: ad }))}
                            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                              lanModalData.selectedAdapter.ip === ad.ip
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Wifi className="w-3.5 h-3.5" />
                            <span>{ad.interface} ({ad.ip})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400">4-Letter Room Code</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xl font-mono font-extrabold text-blue-600 tracking-wider">
                        {lanModalData.code}
                      </span>
                      <button
                        onClick={() => copyCode(lanModalData.code)}
                        className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 shadow-2xs"
                      >
                        {copiedCode === lanModalData.code ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode === lanModalData.code ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Host Wi-Fi / Hotspot LAN URL
                      </span>
                      {lanModalData.selectedAdapter?.subnet && (
                        <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Subnet: {lanModalData.selectedAdapter.subnet}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-mono font-bold text-slate-800 truncate mr-2">
                        {lanModalData.selectedAdapter?.url}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lanModalData.selectedAdapter?.url);
                          setCopiedLanUrl(true);
                          setTimeout(() => setCopiedLanUrl(false), 2000);
                        }}
                        className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 shadow-2xs shrink-0"
                      >
                        {copiedLanUrl ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLanUrl ? 'Copied' : 'Copy URL'}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 font-medium px-1">
                    Collaborators on the same Wi-Fi or Mobile Hotspot can click "Scan Same LAN" or enter this code.
                  </p>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        const room = lanModalData.room;
                        setLanModalData(null);
                        onOpenBoard({ room, isOffline: false });
                      }}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                    >
                      <span>Enter Whiteboard Session</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Desktop App / System App Modal */}
      {showAppModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Run as System Desktop App</h3>
                  <p className="text-xs text-slate-500">Standalone window without browser tabs or address bar</p>
                </div>
              </div>
              <button
                onClick={() => setShowAppModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">1</span>
                  <h4 className="text-xs font-bold text-blue-950">Option A: 1-Click Install to Desktop / Taskbar</h4>
                </div>
                <p className="text-xs text-blue-900 leading-relaxed pl-7">
                  Click the <strong>Install / App</strong> icon in your browser's address bar (or browser menu &rarr; <em>"Install Collaborative Whiteboard"</em>). It pins the whiteboard directly to your Windows Start Menu, Taskbar, and Desktop as a standalone window!
                </p>
              </div>

              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center">2</span>
                  <h4 className="text-xs font-bold text-indigo-950">Option B: Windows Standalone Desktop Launcher</h4>
                </div>
                <p className="text-xs text-indigo-900 leading-relaxed pl-7">
                  Double-click <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">Collaborative_Whiteboard.vbs</strong> or <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">Collaborative_Whiteboard.bat</strong> in the project folder. It launches the background server and opens an ultra-fast borderless native desktop window.
                </p>
              </div>

              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center">3</span>
                  <h4 className="text-xs font-bold text-emerald-950">Option C: Sharing with Partners (Offline & Online)</h4>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed pl-7">
                  Partners connecting to your Wi-Fi or Hotspot can open your Host URL on their laptop or tablet, then tap <strong>"Desktop App"</strong> to install the application natively on their device too!
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowAppModal(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personal Board Name Prompt Modal */}
      <PromptModal
        isOpen={showPersonalBoardPrompt}
        title="Create Personal Workspace"
        message="Enter a name for your private offline whiteboard:"
        initialValue={`My Workspace #${personalBoards.length + 1}`}
        placeholder="Workspace Name"
        confirmText="Create Workspace"
        onConfirm={handleConfirmCreatePersonalBoard}
        onClose={() => setShowPersonalBoardPrompt(false)}
      />
    </div>
  );
}


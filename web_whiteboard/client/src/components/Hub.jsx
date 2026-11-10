import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Wifi,
  Laptop,
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
  Trash2
} from 'lucide-react';

export default function Hub({
  user,
  onOpenAccountModal,
  onOpenBoard,
  onJoinRoom
}) {
  const [currentTab, setCurrentTab] = useState('group'); // 'group' | 'personal'
  const [searchQuery, setSearchQuery] = useState('');
  const [enrolledRooms, setEnrolledRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [personalBoards, setPersonalBoards] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Load user's enrolled rooms from database & localStorage personal boards
  useEffect(() => {
    fetchRooms();
    loadPersonalBoards();
  }, [user]);

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
    const title = prompt('Enter Personal Board Name:', `My Workspace #${personalBoards.length + 1}`);
    if (!title) return;

    const newBoard = {
      id: `pers_${Date.now()}`,
      title: title.trim(),
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
        const rawTitle = data.title || file.name.replace(/\.[^/.]+$/, "");
        const newBoard = {
          id: `pers_import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: `${rawTitle} (Local Copy)`,
          created_at: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          actions: importedActions
        };

        // Persist offline actions locally
        localStorage.setItem(`offline_actions_${newBoard.id}`, JSON.stringify(importedActions));
        const updated = [newBoard, ...personalBoards];
        savePersonalBoards(updated);

        e.target.value = '';

        alert(`Successfully imported "${newBoard.title}" into Personal Space!\n\nThis board is completely local on your device and will NOT interfere with the live collaborative session.`);
        onOpenBoard({ room: { code: newBoard.id, title: newBoard.title, actions: importedActions }, isOffline: true });
      } catch (err) {
        alert('Invalid whiteboard package file: ' + err.message);
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
      cloud: 'Cloud Collaboration Session',
      hotspot: 'Direct Hotspot Whiteboard',
      localhost: 'Localhost Session'
    };
    const title = prompt('Enter the name of your whiteboard session:', defaultTitles[mode] || 'Team Whiteboard');
    if (!title) return;

    setLoading(true);
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          hostUserCode: user.user_code,
          hostName: user.name,
          isPublic: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');

      onOpenBoard({ room: data.room, isOffline: false });
    } catch (err) {
      alert(`Error creating room: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDirect = (code) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    onJoinRoom(clean);
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight flex items-center gap-2">
              Whiteboard Logs & Workspace
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">v2.0</span>
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

        {/* Right User Profile Capsule */}
        <div className="flex items-center gap-3">
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
            {/* Section 1: 3 Hosting Options */}
            <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Create Group Whiteboard</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-5">
                Choose your network connection mode to host a collaborative session:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Option 1: Cloud & Internet Mode */}
                <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/50 flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="p-2.5 rounded-xl bg-blue-600 text-white shadow-sm">
                        <Globe className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-blue-200 text-blue-900 rounded-full">
                        Mobile + Wi-Fi
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">1. With Internet</h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Connect nodes across cellular mobile networks (4G/5G) and home/office Wi-Fi worldwide.
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleCreateGroupRoom('cloud')}
                    className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Host on Internet
                  </button>
                </div>

                {/* Option 2: Without Internet (Direct Hotspot) */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
                        <Wifi className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-200 text-emerald-900 rounded-full">
                        Zero Internet
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">2. Without Internet</h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Peer-to-peer over local Wi-Fi router or Mobile Hotspot with NO active internet connection.
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleCreateGroupRoom('hotspot')}
                    className="mt-5 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    1-Click Host Hotspot
                  </button>
                </div>

                {/* Option 3: Localhost */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="p-2.5 rounded-xl bg-slate-800 text-white shadow-sm">
                        <Laptop className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-slate-200 text-slate-800 rounded-full">
                        Loopback
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">3. Run on Localhost</h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Fast 127.0.0.1 loopback for offline testing and single-machine multi-window collaboration.
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleCreateGroupRoom('localhost')}
                    className="mt-5 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Run Localhost
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Join Active Room */}
            <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Join Existing Whiteboard</h3>
                <p className="text-xs text-slate-500">Enter the 4-letter room code shared by your host:</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  maxLength={4}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="HZSE"
                  className="w-28 px-3 py-2 text-center text-sm font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl uppercase tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleJoinDirect(joinCodeInput)}
                  className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <span>Join Room</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
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
    </div>
  );
}


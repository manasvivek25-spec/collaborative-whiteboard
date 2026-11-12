import React, { useState, useEffect } from 'react';
import { User, Mail, Sparkles, Copy, Check, ShieldCheck, X, Clock, Activity } from 'lucide-react';

const PRESET_COLORS = [
  '#0284c7', '#2563eb', '#7c3aed', '#db2777', 
  '#ea580c', '#16a34a', '#0d9488', '#475569'
];

export default function AccountModal({ user, onSave, onClose, isEditing = false }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#0284c7');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (user?.user_code) {
      fetch(`/api/user/${user.user_code}/activity-logs`)
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.logs)) {
            setActivityLogs(d.logs);
          }
        })
        .catch(() => {});
    }
  }, [user?.user_code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }
    setError('');
    setLoading(true);

    const emailValue = email.trim() || `${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'}@whiteboard.local`;
    const customHost = localStorage.getItem('whiteboard_custom_server') || '';
    const isLan = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const baseUrl = customHost && !isLan
      ? (customHost.startsWith('http') ? customHost : `http://${customHost}`).replace(/\/$/, '')
      : '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: emailValue,
          avatarColor,
          avatarUrl: avatarUrl.trim()
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          onSave(data.user);
          return;
        }
      }
    } catch (err) {
      console.warn('[Account] Server login fetch note, applying local profile:', err.message);
    } finally {
      setLoading(false);
    }

    // Seamless offline/local fallback: NEVER block user with "Failed to fetch"
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString(36).toUpperCase();
    const fallbackUser = {
      id: user?.id || Date.now(),
      user_code: user?.user_code || `USR-${randomHex.padStart(4, 'X').slice(-4)}`,
      name: name.trim(),
      email: emailValue,
      avatar_color: avatarColor,
      avatar_url: avatarUrl.trim(),
      created_at: new Date().toISOString()
    };

    onSave(fallbackUser);
  };

  const copyCode = () => {
    if (!user?.user_code) return;
    navigator.clipboard.writeText(user.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-300" />
              {isEditing ? 'Your Account Profile' : 'Create Whiteboard Account'}
            </h2>
            <p className="text-blue-100 text-xs mt-1">
              {isEditing 
                ? 'View your auto-generated Account Code and profile details' 
                : 'Join collaborative whiteboards across mobile, Wi-Fi, and LAN'}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Existing Account Code Badge (if user exists) */}
        {user?.user_code && (
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Your Account Code</span>
              <p className="text-lg font-black text-blue-900 font-mono tracking-wider">{user.user_code}</p>
            </div>
            <button
              onClick={copyCode}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Avatar Color</label>
            <div className="flex gap-2 items-center flex-wrap">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setAvatarColor(col)}
                  style={{ backgroundColor: col }}
                  className={`w-7 h-7 rounded-full transition-transform ${avatarColor === col ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'hover:scale-105'}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Profile Picture URL (Optional)</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/photo.png"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Saving...' : isEditing ? 'Update Account' : 'Generate Account & Code'}
            </button>
          </div>

          {/* Stored User Activity Logs */}
          {user?.user_code && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="w-full py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center justify-between transition"
              >
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  Stored Activity & Session Logs ({activityLogs.length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {showLogs ? '▲ Hide' : '▼ View'}
                </span>
              </button>

              {showLogs && (
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1 animate-fade-in">
                  {activityLogs.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      No session activity logged yet.
                    </p>
                  ) : (
                    activityLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 font-mono">
                            {log.action_type}
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-2.5 h-2.5" />
                            {log.created_at || ''}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[10px] leading-tight">
                          {log.details}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}


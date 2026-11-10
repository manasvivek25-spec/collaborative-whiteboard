import React, { useState, useEffect } from 'react';
import { UserPlus, Hash, Mail, Network, X, Check, Search, Users } from 'lucide-react';

export default function AddMemberModal({ isOpen, onClose, onAddMember, connectedUsers = [] }) {
  const [target, setTarget] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!target.trim()) return;
    onAddMember(target.trim());
    onClose();
  };

  const handleSelectActive = (user) => {
    setTarget(user.user_code);
    setSelectedUser(user);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Add Member to Session</h3>
              <p className="text-slate-400 text-xs">Invite peers across mobile, Wi-Fi, or LAN</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Member Account Code, Email, or IP
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                autoFocus
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. USR-7K9P or peer@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Ask your partner for their 8-character Account Code shown in their profile.
            </p>
          </div>

          {/* Quick-Pick Connected Users on Server */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Active on Server (Click to Select)
              </span>
              <span className="text-[11px] text-slate-500">{connectedUsers.length} online</span>
            </div>

            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
              {connectedUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No other users currently idle on the server. You can type any Account Code or Email above.
                </div>
              ) : (
                connectedUsers.map((u) => (
                  <div
                    key={u.user_code}
                    onClick={() => handleSelectActive(u)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer hover:bg-blue-50/80 transition text-xs ${target === u.user_code ? 'bg-blue-50 font-semibold text-blue-900' : 'text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                        {u.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{u.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{u.user_code} · {u.ip || 'LAN'}</p>
                      </div>
                    </div>
                    {target === u.user_code && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md transition flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add to Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


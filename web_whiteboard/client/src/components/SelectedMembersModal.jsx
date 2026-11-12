import React, { useState, useEffect } from 'react';
import {
  Users,
  Check,
  X,
  Search,
  CheckSquare,
  Square,
  ShieldCheck,
  Pencil,
  MessageSquare,
  History,
  Image as ImageIcon
} from 'lucide-react';

const PERM_METADATA = {
  canva: {
    label: 'Draw on Canvas',
    desc: 'Selected members will be permitted to draw, insert shapes, tables, sticky notes, and textboxes.',
    icon: Pencil,
    color: 'text-blue-600 bg-blue-50'
  },
  chat: {
    label: 'Chatbox Messaging',
    desc: 'Selected members will be permitted to send live chat messages to the room.',
    icon: MessageSquare,
    color: 'text-indigo-600 bg-indigo-50'
  },
  instances: {
    label: 'Manage Instances',
    desc: 'Selected members will be permitted to save and manage whiteboard instances.',
    icon: History,
    color: 'text-teal-600 bg-teal-50'
  },
  public_work: {
    label: 'Share to Public Works',
    desc: 'Selected members will be permitted to publish high-resolution screenshots to room Public Works.',
    icon: ImageIcon,
    color: 'text-purple-600 bg-purple-50'
  }
};

export default function SelectedMembersModal({
  isOpen,
  onClose,
  permKey = 'canva',
  members = [],
  onApply
}) {
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const meta = PERM_METADATA[permKey] || PERM_METADATA.canva;
  const Icon = meta.icon;

  // Filter out the host; non-hosts are selectable
  const selectableMembers = members.filter(m => m.role !== 'host');

  // Initialize selected members from current permissions
  useEffect(() => {
    if (!isOpen) return;
    const initial = new Set();
    selectableMembers.forEach(m => {
      let isAllowed = false;
      if (permKey === 'canva') isAllowed = Boolean(m.can_draw || m.raw_can_draw);
      else if (permKey === 'chat') isAllowed = Boolean(m.can_chat || m.raw_can_chat);
      else if (permKey === 'instances') isAllowed = Boolean(m.can_instances || m.raw_can_instances);
      else if (permKey === 'public_work') isAllowed = Boolean(m.can_public_work || m.raw_can_public_work);

      if (isAllowed) {
        initial.add(m.user_code);
      }
    });
    setSelectedCodes(initial);
    setSearchQuery('');
  }, [isOpen, permKey, members]);

  if (!isOpen) return null;

  const toggleMember = (userCode) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(userCode)) next.delete(userCode);
      else next.add(userCode);
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set(selectableMembers.map(m => m.user_code));
    setSelectedCodes(all);
  };

  const handleDeselectAll = () => {
    setSelectedCodes(new Set());
  };

  const handleConfirm = () => {
    if (onApply) {
      onApply(permKey, Array.from(selectedCodes));
    }
    onClose();
  };

  const filtered = selectableMembers.filter(m =>
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.user_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${meta.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                Selected Members: {meta.label}
              </h3>
              <p className="text-xs text-slate-500">
                Choose members with granted access for this policy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explanation & Search Bar */}
        <div className="p-4 bg-blue-50/40 border-b border-blue-100/60 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            {meta.desc} Non-selected members will be restricted from this action.
          </p>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search member by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-100/70 hover:bg-blue-100 rounded-lg transition shrink-0"
            >
              Select All
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition shrink-0"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Members Roster */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {selectableMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-xs">No other members in the room</p>
              <p className="text-[11px] mt-1">Add members or invite partners using the room code.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              No matching members found for "{searchQuery}"
            </div>
          ) : (
            filtered.map((m) => {
              const isChecked = selectedCodes.has(m.user_code);
              return (
                <div
                  key={m.user_code}
                  onClick={() => toggleMember(m.user_code)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                    isChecked
                      ? 'bg-blue-50/70 border-blue-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        style={{ backgroundColor: m.avatar_color || '#2563eb' }}
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-2xs"
                      >
                        {m.name?.slice(0, 2).toUpperCase() || 'U'}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          m.online ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-slate-800 truncate">
                        {m.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {m.user_code} &bull; {m.online ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-[11px] font-bold ${isChecked ? 'text-blue-700' : 'text-slate-400'}`}>
                      {isChecked ? 'Allowed' : 'Blocked'}
                    </span>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                      isChecked
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}>
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <span className="text-xs font-semibold text-slate-600">
            Selected: <strong className="text-blue-700">{selectedCodes.size}</strong> of {selectableMembers.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              Apply & Save Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

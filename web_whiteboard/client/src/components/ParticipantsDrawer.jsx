import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Star,
  Ban,
  Check,
  UserMinus,
  X,
  Lock,
  Pencil,
  MessageSquare,
  History,
  Image,
  ChevronDown,
  ChevronUp,
  Settings,
  Sliders
} from 'lucide-react';
import SelectedMembersModal from './SelectedMembersModal';

export default function ParticipantsDrawer({
  isOpen,
  onClose,
  members = [],
  currentUserCode = '',
  isHost = false,
  isCohost = false,
  room = {},
  onUpdateRoomPermissions,
  onUpdateMemberCustomPermissions,
  onToggleDraw,
  onBlockAll,
  onAllowAll,
  onPromoteCohost,
  onKickMember,
  onOpenAddMember
}) {
  const [showMatrix, setShowMatrix] = useState(true);
  const [selectedModalKey, setSelectedModalKey] = useState(null);

  if (!isOpen) return null;

  const canManage = isHost || isCohost;
  const onlineCount = members.filter(m => m.online).length;
  const onlineMembers = members.filter(m => m.online);
  const offlineMembers = members.filter(m => !m.online);

  const renderMemberCard = (m) => {
    const isMe = m.user_code === currentUserCode;
    const isTargetHost = m.role === 'host';
    const isTargetCohost = m.role === 'cohost';

    return (
      <div
        key={m.user_code}
        className={`p-2.5 rounded-xl border flex flex-col gap-2 transition ${
          isMe
            ? 'bg-blue-50/50 border-blue-200'
            : m.online
            ? 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
            : 'bg-slate-50/60 border-slate-200/60 opacity-70 hover:opacity-100'
        }`}
      >
        {/* Member Top Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div
                style={{ backgroundColor: m.avatar_color || '#2563eb' }}
                className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-2xs"
              >
                {m.name?.slice(0, 2).toUpperCase() || 'U'}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  m.online ? 'bg-emerald-500 ring-1 ring-emerald-300' : 'bg-slate-300'
                }`}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-xs truncate ${m.online ? 'text-slate-800' : 'text-slate-500'}`}>
                  {m.name} {isMe && '(You)'}
                </span>
                {isTargetHost ? (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold text-[9px] rounded shrink-0">
                    Host
                  </span>
                ) : isTargetCohost ? (
                  <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 font-bold text-[9px] rounded flex items-center gap-0.5 shrink-0">
                    <Star className="w-2.5 h-2.5 fill-purple-700" />
                    Co-host
                  </span>
                ) : null}
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {m.user_code} {m.online ? '· active' : '· offline'}
              </p>
            </div>
          </div>

          {/* Host Actions: Promote Co-host / Kick */}
          {isHost && !isTargetHost && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPromoteCohost(m.user_code, !isTargetCohost)}
                title={isTargetCohost ? 'Remove Co-host' : 'Promote to Co-host'}
                className={`p-1.5 rounded-lg text-xs transition ${
                  isTargetCohost
                    ? 'text-purple-600 bg-purple-50'
                    : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isTargetCohost ? 'fill-purple-600' : ''}`} />
              </button>

              <button
                onClick={() => onKickMember(m.user_code)}
                title="Remove member from room"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <UserMinus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Granular Permission Toggles (When policy is 'Selected' or for Host customization) */}
        {!isTargetHost && (
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <span className="text-slate-400 font-medium">Access:</span>

            <div className="flex items-center gap-1">
              {/* Canva Draw Toggle */}
              <button
                disabled={!isHost || canvaPerm !== 'selected'}
                onClick={() => {
                  if (!isHost || canvaPerm !== 'selected') return;
                  if (onUpdateMemberCustomPermissions) {
                    onUpdateMemberCustomPermissions(m.user_code, { can_draw: !m.can_draw });
                  } else if (onToggleDraw) {
                    onToggleDraw(m.user_code, m.can_draw ? 0 : 1);
                  }
                }}
                title={`Canvas Drawing: ${m.can_draw ? 'Allowed' : 'Blocked'}`}
                className={`px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 transition ${
                  m.can_draw
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-700'
                } ${isHost && canvaPerm === 'selected' ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-90'}`}
              >
                <Pencil className="w-2.5 h-2.5" />
                <span>Draw</span>
              </button>

              {/* Chat Toggle */}
              <button
                disabled={!isHost || chatPerm !== 'selected'}
                onClick={() => {
                  if (!isHost || chatPerm !== 'selected') return;
                  if (onUpdateMemberCustomPermissions) {
                    onUpdateMemberCustomPermissions(m.user_code, { can_chat: !m.can_chat });
                  }
                }}
                title={`Chat: ${m.can_chat ? 'Allowed' : 'Blocked'}`}
                className={`px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 transition ${
                  m.can_chat
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-200 text-slate-500'
                } ${isHost && chatPerm === 'selected' ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-90'}`}
              >
                <MessageSquare className="w-2.5 h-2.5" />
                <span>Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const canvaPerm = room?.canva_perm || 'everyone'; // 'everyone' | 'selected' | 'host_only'
  const chatPerm = room?.chat_perm || room?.chat_permission || 'everyone';
  const instancesPerm = room?.instances_perm || 'everyone';
  const publicWorkPerm = room?.public_work_perm || 'everyone';

  const handlePermChange = (key, val) => {
    if (!onUpdateRoomPermissions) return;
    if (val === 'selected') {
      // Pop up the Selected Members Dialog Box for the host to choose allowed members
      setSelectedModalKey(key);
      return;
    }
    onUpdateRoomPermissions({
      canva_perm: key === 'canva' ? val : canvaPerm,
      chat_perm: key === 'chat' ? val : chatPerm,
      instances_perm: key === 'instances' ? val : instancesPerm,
      public_work_perm: key === 'public_work' ? val : publicWorkPerm
    });
  };

  const handleApplySelectedMembers = (key, selectedCodes) => {
    if (!onUpdateRoomPermissions) return;
    onUpdateRoomPermissions({
      perm_key: key,
      selected_user_codes: selectedCodes,
      canva_perm: key === 'canva' ? 'selected' : canvaPerm,
      chat_perm: key === 'chat' ? 'selected' : chatPerm,
      instances_perm: key === 'instances' ? 'selected' : instancesPerm,
      public_work_perm: key === 'public_work' ? 'selected' : publicWorkPerm
    });
  };

  const PERM_ROWS = [
    { key: 'canva', label: 'Draw on Canvas', icon: Pencil, current: canvaPerm },
    { key: 'chat', label: 'Chatbox Messaging', icon: MessageSquare, current: chatPerm },
    { key: 'instances', label: 'Manage Instances', icon: History, current: instancesPerm },
    { key: 'public_work', label: 'Share to Public Works', icon: Image, current: publicWorkPerm }
  ];

  return (
    <div className="w-80 sm:w-96 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl animate-slide-in z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-800">Participants</h3>
          <span className="text-xs text-slate-500 font-medium">({members.length}) &bull; {onlineCount} online</span>
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <button
              onClick={onOpenAddMember}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3-Option Host Control Permissions Matrix (Host Only) */}
      {isHost && (
        <div className="border-b border-slate-200 bg-blue-50/40">
          <button
            onClick={() => setShowMatrix(!showMatrix)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-blue-50 transition"
          >
            <span className="flex items-center gap-1.5 text-blue-900">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              Host Permission Matrix (3 Options)
            </span>
            {showMatrix ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {showMatrix && (
            <div className="px-3.5 pb-3 space-y-2.5 text-[11px] animate-fade-in border-t border-blue-100/60 pt-2.5">
              {PERM_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.key} className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Icon className="w-3 h-3 text-slate-500" />
                      {row.label}
                    </span>
                    <div className="grid grid-cols-3 gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                      {[
                        { id: 'everyone', label: 'Everyone' },
                        { id: 'selected', label: 'Selected' },
                        { id: 'host_only', label: 'Host Only' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            if (opt.id === 'selected') {
                              setSelectedModalKey(row.key);
                            } else {
                              handlePermChange(row.key, opt.id);
                            }
                          }}
                          className={`py-1 text-[10px] font-bold rounded-md transition flex items-center justify-center gap-1 ${
                            row.current === opt.id
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {opt.id === 'selected' && row.current === 'selected' && (
                            <Sliders className="w-2.5 h-2.5 opacity-80" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Participants List (Discord Style: Online vs Offline) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* ONLINE GROUP */}
        {onlineMembers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-xs animate-pulse"></span>
              <span>Online &bull; {onlineMembers.length}</span>
            </div>
            {onlineMembers.map(m => renderMemberCard(m))}
          </div>
        )}

        {/* OFFLINE GROUP */}
        {offlineMembers.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>
              <span>Offline &bull; {offlineMembers.length}</span>
            </div>
            {offlineMembers.map(m => renderMemberCard(m))}
          </div>
        )}

        {members.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400">
            No participants recorded in this session yet.
          </div>
        )}
      </div>

      {/* Selected Members Dialog Box */}
      <SelectedMembersModal
        isOpen={Boolean(selectedModalKey)}
        onClose={() => setSelectedModalKey(null)}
        permKey={selectedModalKey || 'canva'}
        members={members}
        onApply={handleApplySelectedMembers}
      />
    </div>
  );
}

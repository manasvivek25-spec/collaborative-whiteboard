import React from 'react';
import { Users, UserPlus, Shield, Star, Ban, Check, UserMinus, X, Lock } from 'lucide-react';

export default function ParticipantsDrawer({
  isOpen,
  onClose,
  members = [],
  currentUserCode = '',
  isHost = false,
  isCohost = false,
  onToggleDraw,
  onBlockAll,
  onAllowAll,
  onPromoteCohost,
  onKickMember,
  onOpenAddMember
}) {
  if (!isOpen) return null;

  const canManage = isHost || isCohost;
  const onlineCount = members.filter(m => m.online).length;

  return (
    <div className="w-80 sm:w-96 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl animate-slide-in z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-800">Participants</h3>
          <span className="text-xs text-slate-500 font-medium">({members.length}) · {onlineCount} online</span>
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <button
              onClick={onOpenAddMember}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Host Controls Quick Bar */}
      {canManage && (
        <div className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
          <span className="font-semibold text-blue-900 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Host Controls
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={onBlockAll}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg text-[11px] shadow-sm transition"
            >
              Block All
            </button>
            <button
              onClick={onAllowAll}
              className="px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 font-bold rounded-lg text-[11px] shadow-sm transition"
            >
              Allow All
            </button>
          </div>
        </div>
      )}

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {members.map((m) => {
          const isMe = m.user_code === currentUserCode;
          const isTargetHost = m.role === 'host';
          const isTargetCohost = m.role === 'cohost';

          return (
            <div
              key={m.user_code}
              className={`p-3 rounded-xl border flex items-center justify-between transition ${
                isMe ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50/70 border-slate-200 hover:bg-white'
              }`}
            >
              {/* Left: Avatar + Details */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    style={{ backgroundColor: m.avatar_color || '#2563eb' }}
                    className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-sm"
                  >
                    {m.name?.slice(0, 2).toUpperCase() || 'U'}
                  </div>
                  {/* Status dot */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                      m.online ? 'bg-green-500' : 'bg-slate-400'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-slate-800">
                      {m.name} {isMe && '(You)'}
                    </span>
                    {isTargetHost ? (
                      <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold text-[10px] rounded">
                        Host
                      </span>
                    ) : isTargetCohost ? (
                      <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 font-bold text-[10px] rounded flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-purple-700" />
                        Co-host
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {m.user_code} {!m.online && '· offline'}
                  </p>
                </div>
              </div>

              {/* Right: Permissions & Actions */}
              <div className="flex items-center gap-1.5">
                {/* Drawing Status Badge */}
                {m.can_draw ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-md">
                    Can Draw
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded-md">
                    Blocked
                  </span>
                )}

                {/* Host Action Buttons */}
                {canManage && !isTargetHost && (
                  <div className="flex items-center gap-1 ml-1">
                    {/* Toggle Draw */}
                    <button
                      onClick={() => onToggleDraw(m.user_code, m.can_draw ? 0 : 1)}
                      title={m.can_draw ? 'Block Drawing' : 'Allow Drawing'}
                      className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                        m.can_draw
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {m.can_draw ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>

                    {/* Star Co-host (Host only) */}
                    {isHost && (
                      <button
                        onClick={() => onPromoteCohost(m.user_code, !isTargetCohost)}
                        title={isTargetCohost ? 'Remove Co-host' : 'Promote to Co-host'}
                        className={`p-1.5 rounded-lg text-xs transition ${
                          isTargetCohost
                            ? 'text-purple-600 hover:bg-purple-50'
                            : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isTargetCohost ? 'fill-purple-600' : ''}`} />
                      </button>
                    )}

                    {/* Kick */}
                    <button
                      onClick={() => onKickMember(m.user_code)}
                      title="Remove participant"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


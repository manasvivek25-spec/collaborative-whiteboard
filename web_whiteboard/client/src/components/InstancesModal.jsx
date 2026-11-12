import React, { useState } from 'react';
import {
  Camera,
  RotateCcw,
  Trash2,
  X,
  Lock,
  Clock,
  Eye,
  Radio,
  HardDrive,
  Globe,
  Sparkles,
  ShieldCheck,
  Check
} from 'lucide-react';

export default function InstancesModal({
  isOpen,
  onClose,
  milestones = [],
  privateMilestones = [],
  onSaveMilestone,
  onRestoreMilestone,
  onShowInstance,
  onBroadcastShow,
  onDeleteMilestone,
  isHost = false,
  canSave = true,
  canSharePublic = true,
  currentUserCode = ''
}) {
  const [title, setTitle] = useState('');
  const [saveDestination, setSaveDestination] = useState(canSharePublic ? 'public' : 'private');
  const [activeTab, setActiveTab] = useState('list_public'); // 'list_public' | 'list_private' | 'save'

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (onSaveMilestone) {
      onSaveMilestone({
        title: title.trim(),
        destination: saveDestination
      });
    }
    setTitle('');
    setActiveTab(saveDestination === 'public' ? 'list_public' : 'list_private');
  };

  const publicList = milestones.filter(m => m.is_public !== false);
  const privateList = [
    ...milestones.filter(m => m.is_public === false),
    ...privateMilestones
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Session Works & Saved Instances</h3>
              <p className="text-slate-400 text-xs">Simulate sandbox states or restore live collaborative canvas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 px-6 pt-3 bg-slate-50 gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('list_public')}
            className={`pb-2 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'list_public' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Public Works Instances ({publicList.length})
          </button>

          <button
            onClick={() => setActiveTab('list_private')}
            className={`pb-2 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'list_private' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            My Private Instances ({privateList.length})
          </button>

          {canSave && (
            <button
              onClick={() => setActiveTab('save')}
              className={`pb-2 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'save' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              + Save New Instance
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'save' ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Instance Title
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sprint 1 Brainstorm, Geometry Proof v2"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Save Destination
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Private Option */}
                  <div
                    onClick={() => setSaveDestination('private')}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      saveDestination === 'private'
                        ? 'border-teal-600 bg-teal-50/70 shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <HardDrive className={`w-4 h-4 shrink-0 mt-0.5 ${saveDestination === 'private' ? 'text-teal-700' : 'text-slate-400'}`} />
                    <div>
                      <p className="font-bold text-xs text-slate-800">💾 Save in My Own System</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Private to your account, not shared in room public works.</p>
                    </div>
                  </div>

                  {/* Public Option */}
                  <div
                    onClick={() => {
                      if (canSharePublic) setSaveDestination('public');
                    }}
                    className={`p-3 rounded-xl border-2 transition flex items-start gap-2.5 ${
                      !canSharePublic
                        ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                        : saveDestination === 'public'
                        ? 'border-teal-600 bg-teal-50/70 shadow-2xs cursor-pointer'
                        : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    {canSharePublic ? (
                      <Globe className={`w-4 h-4 shrink-0 mt-0.5 ${saveDestination === 'public' ? 'text-teal-700' : 'text-slate-400'}`} />
                    ) : (
                      <Lock className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    )}
                    <div>
                      <p className="font-bold text-xs text-slate-800 flex items-center gap-1">
                        🌐 Share to Public Works
                        {!canSharePublic && <span className="text-[9px] text-red-600 bg-red-100 px-1 rounded">Host Only</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Visible to all session participants in Public Works.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('list_public')}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Save Instance
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {(() => {
                const currentItems = activeTab === 'list_public' ? publicList : privateList;
                if (currentItems.length === 0) {
                  return (
                    <div className="p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-sm text-slate-700">
                        {activeTab === 'list_public' ? 'No public instances saved yet' : 'No private instances saved yet'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        {activeTab === 'list_public'
                          ? 'Milestone instances shared to Public Works will appear here for all participants.'
                          : 'Instances saved to your own system remain private to your local account.'}
                      </p>
                    </div>
                  );
                }

                return currentItems.map((ms) => {
                  const actCount = Array.isArray(ms.snapshot) ? ms.snapshot.filter(a => !a.undone).length : 0;
                  const isPublic = ms.is_public !== false;
                  const canDelete = isHost || ms.author_code === currentUserCode || !isPublic;

                  return (
                    <div
                      key={ms.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white transition shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 truncate">{ms.title}</h4>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                            isPublic ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {isPublic ? 'Public Work' : 'Private (My System)'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {ms.timestamp}
                          </span>
                          <span>&bull;</span>
                          <span>By: <strong className="text-slate-700">{ms.author_name || ms.author || 'User'}</strong></span>
                          <span>&bull;</span>
                          <span className="text-slate-400">{actCount} elements</span>
                        </div>
                      </div>

                      {/* Action Buttons: Show vs Restore (Host Only) */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* 1. SHOW / WORK IN SANDBOX (Always available to everyone) */}
                        <button
                          onClick={() => {
                            if (onShowInstance) onShowInstance(ms);
                            onClose();
                          }}
                          title="Simulate and work in this isolated instance without modifying live canvas"
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600" />
                          Show / Sandbox
                        </button>

                        {/* 2. BROADCAST SHOW TO ALL (Host Only) */}
                        {isHost && onBroadcastShow && isPublic && (
                          <button
                            onClick={() => {
                              onBroadcastShow(ms);
                              onClose();
                            }}
                            title="Host Action: Broadcast instance sandbox view to all members live"
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl transition"
                          >
                            <Radio className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 3. RESTORE TO LIVE STATE (Strictly Host Only) */}
                        {isHost ? (
                          <button
                            onClick={() => {
                              if (window.confirm(`Restore canvas to instance "${ms.title}"?\nThis will update the live whiteboard for all session participants.`)) {
                                onRestoreMilestone(ms.snapshot, ms.title);
                                onClose();
                              }
                            }}
                            title="Host Action: Restore live collaborative canvas to this milestone"
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                        ) : (
                          <span
                            title="Restricted: Only the host has permission to restore canvas instances to the live whiteboard"
                            className="px-2.5 py-1 bg-slate-200 text-slate-500 rounded-xl text-[11px] font-medium flex items-center gap-1 cursor-not-allowed"
                          >
                            <Lock className="w-3 h-3" />
                            Host Only
                          </span>
                        )}

                        {/* 4. DELETE INSTANCE (Host for public items, or author for private items) */}
                        {canDelete && onDeleteMilestone && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete instance "${ms.title}"?`)) {
                                onDeleteMilestone(ms.id, isPublic);
                              }
                            }}
                            title="Delete this instance"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

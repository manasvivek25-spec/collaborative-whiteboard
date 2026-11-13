import React, { useState } from 'react';
import {
  Camera,
  Download,
  Share2,
  Bookmark,
  Check,
  X,
  Lock,
  Globe,
  FileBox,
  Send,
  Crop
} from 'lucide-react';

export default function ExportModal({
  isOpen,
  onClose,
  roomTitle,
  roomCode,
  actions = [],
  milestones = [],
  members = [],
  canSaveMilestone = true,
  canPublishPublicWork = true,
  onTakeScreenshot,
  onStartAreaSnap,
  onPublishMilestone,
  onPublishPublicWork,
  onShareWithMember
}) {
  const [activeTab, setActiveTab] = useState('screenshot'); // 'screenshot' | 'bundle' | 'share'
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [sharedSuccess, setSharedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleDownloadBundle = () => {
    const bundle = {
      version: '2.0.0',
      title: roomTitle || 'Whiteboard Session',
      room_code: roomCode,
      exported_at: new Date().toISOString(),
      action_count: actions.length,
      actions: actions.filter(a => !a.undone),
      milestones: milestones
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(roomTitle || 'whiteboard').replace(/[^a-zA-Z0-9]/g, '_')}_${roomCode}_bundle.whiteboard`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePublish = (e) => {
    e.preventDefault();
    if (!canPublishPublicWork && !canSaveMilestone) return;
    const title = snapshotTitle.trim() || `Snapshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (onPublishPublicWork) {
      onPublishPublicWork(title);
    } else if (onPublishMilestone) {
      onPublishMilestone(title);
    }
    setSnapshotTitle('');
    onClose();
  };

  const handleShareToMember = () => {
    if (!selectedMember) return;
    onShareWithMember(selectedMember);
    setSharedSuccess(true);
    setTimeout(() => {
      setSharedSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Screenshot & Share Workspace</h3>
              <p className="text-xs text-slate-500">{roomTitle} &bull; {roomCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
          <button
            onClick={() => setActiveTab('screenshot')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'screenshot' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            Screenshot
          </button>
          <button
            onClick={() => setActiveTab('bundle')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'bundle' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileBox className="w-3.5 h-3.5 text-indigo-600" />
            Export Bundle
          </button>
          <button
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'share' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 text-teal-600" />
            Share Member
          </button>
        </div>

        {/* Tab 1: Screenshot Options */}
        {activeTab === 'screenshot' && (
          <div className="space-y-4">
            {/* Option A0: Snap Specific Area Screenshot */}
            <div className="p-4 bg-cyan-50/80 rounded-xl border border-cyan-200 hover:border-cyan-400 transition flex items-center justify-between">
              <div>
                <h4 className="font-bold text-xs text-cyan-950 flex items-center gap-1.5">
                  <Crop className="w-3.5 h-3.5 text-cyan-600" />
                  Snap Specific Canvas Area
                </h4>
                <p className="text-[11px] text-cyan-700/90 mt-0.5">
                  Drag a box across any canvas region to snip and save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onStartAreaSnap) onStartAreaSnap();
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1 shrink-0"
              >
                <Crop className="w-3.5 h-3.5" />
                Snap Area
              </button>
            </div>
            {/* Option A: Download PNG */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-400 transition flex items-center justify-between">
              <div>
                <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  Save Image to Local Device (PNG)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Downloads high-res snapshot of current canvas. Always available.
                </p>
              </div>
              <button
                onClick={() => {
                  onTakeScreenshot();
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Download
              </button>
            </div>

            {/* Option B: Publish to Public Works Gallery */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-600" />
                  Publish Screenshot to Public Works Gallery
                </h4>
                {!canPublishPublicWork && (
                  <span className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Host Restricted
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                {canPublishPublicWork
                  ? 'Publishes an instant high-resolution screenshot to the shared Public Works Gallery visible to everyone.'
                  : 'The host has restricted publishing to Public Works.'}
              </p>

              {canPublishPublicWork && (
                <form onSubmit={handlePublish} className="flex gap-2">
                  <input
                    type="text"
                    value={snapshotTitle}
                    onChange={(e) => setSnapshotTitle(e.target.value)}
                    placeholder="Screenshot title (e.g. Architecture Diagram, Math Proof)"
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    Publish
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Export Bundle */}
        {activeTab === 'bundle' && (
          <div className="space-y-3">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <FileBox className="w-3.5 h-3.5 text-indigo-600" />
                Complete Whiteboard Package (.whiteboard)
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Packages all actions, strokes, tables, shapes, and milestone instances up to this exact moment.
                Anyone can import this package into their Personal Space for isolated editing!
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Actions: {actions.length}</span>
                <span>Instances: {milestones.length}</span>
              </div>
            </div>

            <button
              onClick={handleDownloadBundle}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download .whiteboard Package
            </button>
          </div>
        )}

        {/* Tab 3: Share Directly to a Member */}
        {activeTab === 'share' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select Connected Member in this Room:
              </label>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Choose Member --</option>
                {members.map((m) => (
                  <option key={m.user_code} value={m.user_code}>
                    {m.name} ({m.user_code}) {m.role === 'host' ? '★ Host' : ''}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-slate-500">
              This delivers the full workspace state up to this moment directly to that member's Personal Space without affecting this live session.
            </p>

            <button
              disabled={!selectedMember || sharedSuccess}
              onClick={handleShareToMember}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              {sharedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  Whiteboard Shared Successfully!
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Whiteboard to Member
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


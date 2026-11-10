import React, { useState } from 'react';
import { Camera, RotateCcw, Trash2, X, Lock, CheckCircle, Clock } from 'lucide-react';

export default function InstancesModal({
  isOpen,
  onClose,
  milestones = [],
  onSaveMilestone,
  onRestoreMilestone,
  canRestore = false,
  canSave = true
}) {
  const [title, setTitle] = useState('');
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'save'

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSaveMilestone(title.trim());
    setTitle('');
    setActiveTab('list');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Session Works & Milestones</h3>
              <p className="text-slate-400 text-xs">Save canvas checkpoints and restore previous versions</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 px-6 pt-3 bg-slate-50 gap-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2 text-xs font-bold transition border-b-2 ${activeTab === 'list' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Saved Milestones ({milestones.length})
          </button>
          {canSave && (
            <button
              onClick={() => setActiveTab('save')}
              className={`pb-2 text-xs font-bold transition border-b-2 ${activeTab === 'save' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              + Save Current Canvas
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'save' ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Milestone Title
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Architecture Diagram v1, Math Problem 2"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <p className="text-xs text-slate-500">
                This captures a full snapshot of all current drawings, shapes, and notes.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Save Milestone
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {milestones.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-sm">No saved milestones yet</p>
                  <p className="text-xs mt-1">Save a snapshot of your canvas anytime to preserve your progress.</p>
                </div>
              ) : (
                milestones.map((ms) => (
                  <div
                    key={ms.id}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-white transition shadow-sm"
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{ms.title}</h4>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {ms.timestamp}
                        </span>
                        <span>By {ms.author_name || ms.author || 'Host'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canRestore ? (
                        <button
                          onClick={() => {
                            onRestoreMilestone(ms.snapshot, ms.title);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </button>
                      ) : (
                        <span
                          title="Restricted: Only Host or Co-host can restore canvas state"
                          className="px-2.5 py-1 bg-slate-200 text-slate-500 rounded-lg text-xs font-medium flex items-center gap-1 cursor-not-allowed"
                        >
                          <Lock className="w-3 h-3" />
                          Host Only
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


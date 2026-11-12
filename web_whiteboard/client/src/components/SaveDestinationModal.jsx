import React, { useState, useEffect } from 'react';
import {
  Camera,
  Layers,
  HardDrive,
  Globe,
  Lock,
  Check,
  X,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export default function SaveDestinationModal({
  isOpen,
  onClose,
  mode = 'screenshot', // 'screenshot' | 'instance'
  canSharePublic = true,
  defaultTitle = '',
  onConfirm
}) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('private'); // 'private' | 'public'

  useEffect(() => {
    if (isOpen) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTitle(defaultTitle || (mode === 'screenshot' ? `Screenshot - ${nowStr}` : `Instance - ${nowStr}`));
      // Default to public if permitted, otherwise private
      setDestination(canSharePublic ? 'public' : 'private');
    }
  }, [isOpen, mode, defaultTitle, canSharePublic]);

  if (!isOpen) return null;

  const isScreenshot = mode === 'screenshot';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (destination === 'public' && !canSharePublic) return;

    if (onConfirm) {
      onConfirm({
        destination,
        title: title.trim()
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col animate-scale-up">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isScreenshot ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
              {isScreenshot ? <Camera className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {isScreenshot ? 'Save Canvas Screenshot' : 'Save Whiteboard Instance'}
              </h3>
              <p className="text-xs text-slate-500">
                Choose where you want to save this work
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {isScreenshot ? 'Screenshot Title' : 'Instance Title'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Blueprint v1"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Save Destination (2 Options)
            </label>

            {/* Option 1: Save in My Own System */}
            <div
              onClick={() => setDestination('private')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 select-none ${
                destination === 'private'
                  ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${destination === 'private' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs text-slate-800">
                    💾 Save in My Own System (Private)
                  </p>
                  {destination === 'private' && <Check className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                  Saved only in your personal computer / account. Completely private and never shown to other members or public space.
                </p>
              </div>
            </div>

            {/* Option 2: Share to Public Works */}
            <div
              onClick={() => {
                if (canSharePublic) setDestination('public');
              }}
              className={`p-3.5 rounded-xl border-2 transition flex items-start gap-3 select-none ${
                !canSharePublic
                  ? 'border-slate-200 bg-slate-100/60 opacity-60 cursor-not-allowed'
                  : destination === 'public'
                  ? 'border-purple-600 bg-purple-50/70 shadow-2xs cursor-pointer'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${!canSharePublic ? 'bg-slate-200 text-slate-400' : destination === 'public' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {canSharePublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    🌐 Share to Public Works
                    {!canSharePublic && (
                      <span className="text-[10px] text-red-600 font-semibold bg-red-100 px-1.5 py-0.2 rounded">
                        Host Only
                      </span>
                    )}
                  </p>
                  {destination === 'public' && <Check className="w-4 h-4 text-purple-600" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                  {canSharePublic
                    ? 'Published to this room’s Public Works. Visible to all active participants in this whiteboard session.'
                    : 'Restricted by Host. Only the host and permitted members can publish to session Public Works.'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 font-bold rounded-xl text-xs shadow-md transition flex items-center gap-1.5 text-white ${
                destination === 'public'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {destination === 'public' ? <Globe className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
              {destination === 'public' ? 'Publish to Public Works' : 'Save to My System'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

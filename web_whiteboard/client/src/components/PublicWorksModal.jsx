import React, { useState } from 'react';
import {
  Image,
  Download,
  Trash2,
  X,
  Maximize2,
  Clock,
  User,
  ExternalLink,
  Sparkles
} from 'lucide-react';

export default function PublicWorksModal({
  isOpen,
  onClose,
  publicWorks = [],
  currentUserCode = '',
  isHost = false,
  onDeleteWork,
  onOpenExportModal
}) {
  const [selectedImage, setSelectedImage] = useState(null);

  if (!isOpen) return null;

  const handleDownload = (work) => {
    const a = document.createElement('a');
    a.href = work.image_data;
    a.download = `${(work.title || 'public_work').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-violet-100 text-violet-700">
              <Image className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                Public Works Gallery
                <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                  {publicWorks.length} {publicWorks.length === 1 ? 'Snapshot' : 'Snapshots'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Shared high-resolution screenshots and whiteboard captures published by session members
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenExportModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenExportModal();
                }}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Capture New Snapshot
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Gallery Content */}
        <div className="overflow-y-auto flex-1 pr-1">
          {publicWorks.length === 0 ? (
            <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl my-4 bg-slate-50/50">
              <Image className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <h4 className="font-bold text-sm text-slate-700">No public work snapshots published yet</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Members with permission can capture instant screenshots of the canvas and publish them directly to this shared gallery.
              </p>
              {onOpenExportModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenExportModal();
                  }}
                  className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Capture & Publish Screenshot
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicWorks.map((work) => {
                const canDelete = isHost || work.author_code === currentUserCode;

                return (
                  <div
                    key={work.id}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-violet-300 hover:shadow-md transition overflow-hidden flex flex-col"
                  >
                    {/* Image Preview Box */}
                    <div
                      onClick={() => setSelectedImage(work)}
                      className="relative h-44 bg-slate-100 border-b border-slate-100 overflow-hidden cursor-pointer"
                    >
                      <img
                        src={work.image_data}
                        alt={work.title}
                        className="w-full h-full object-contain p-2 group-hover:scale-102 transition duration-200"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <span className="p-2 bg-white/90 text-slate-800 rounded-xl shadow-lg backdrop-blur-xs flex items-center gap-1 text-xs font-bold">
                          <Maximize2 className="w-3.5 h-3.5" />
                          View Full
                        </span>
                      </div>
                    </div>

                    {/* Metadata Card Footer */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 line-clamp-1" title={work.title}>
                          {work.title}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <User className="w-3 h-3 text-violet-500" />
                            {work.author_name}
                          </span>
                          <span className="flex items-center gap-1 font-mono text-[10px]">
                            <Clock className="w-3 h-3" />
                            {work.timestamp}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => handleDownload(work)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>

                        {canDelete && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete snapshot "${work.title}" from Public Works?`)) {
                                onDeleteWork(work.id);
                              }
                            }}
                            title="Delete this snapshot"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex flex-col p-4 animate-fade-in"
        >
          <div className="flex items-center justify-between text-white pb-3 px-2">
            <div>
              <h4 className="font-bold text-sm">{selectedImage.title}</h4>
              <p className="text-xs text-slate-300">By {selectedImage.author_name} &bull; {selectedImage.timestamp}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(selectedImage);
                }}
                className="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </button>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 overflow-auto">
            <img
              src={selectedImage.image_data}
              alt={selectedImage.title}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}


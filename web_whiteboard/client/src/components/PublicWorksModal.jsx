import React, { useState } from 'react';
import {
  Image,
  Download,
  Trash2,
  X,
  Maximize2,
  Clock,
  User,
  HardDrive,
  Globe,
  Sparkles,
  Lock
} from 'lucide-react';

export default function PublicWorksModal({
  isOpen,
  onClose,
  publicWorks = [],
  privateWorks = [],
  currentUserCode = '',
  isHost = false,
  onDeleteWork,
  onOpenExportModal
}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState('public'); // 'public' | 'private'

  if (!isOpen) return null;

  const safePublicWorks = Array.isArray(publicWorks) ? publicWorks.filter(Boolean) : [];
  const safePrivateWorks = Array.isArray(privateWorks) ? privateWorks.filter(Boolean) : [];

  const publicList = safePublicWorks.filter(w => w && w.is_public !== false);
  const privateList = [
    ...safePublicWorks.filter(w => w && w.is_public === false),
    ...safePrivateWorks
  ];

  const currentList = activeTab === 'public' ? publicList : privateList;

  const handleDownload = (work) => {
    if (!work || !work.image_data) return;
    const a = document.createElement('a');
    a.href = work.image_data;
    a.download = `${(work.title || 'screenshot').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-violet-100 text-violet-700">
              <Image className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                Whiteboard Screenshots & Public Works
              </h3>
              <p className="text-xs text-slate-500">
                Browse shared public works or your private system screenshots
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
                Capture Screenshot
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

        {/* Tab Switcher: Public Works vs My Private Screenshots */}
        <div className="flex border-b border-slate-200 gap-4 mb-4">
          <button
            onClick={() => setActiveTab('public')}
            className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'public'
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Public Works Screenshots ({publicList.length})
          </button>

          <button
            onClick={() => setActiveTab('private')}
            className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'private'
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            My System Screenshots ({privateList.length})
          </button>
        </div>

        {/* Gallery Content */}
        <div className="overflow-y-auto flex-1 pr-1">
          {currentList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl my-4 bg-slate-50/50">
              <Image className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <h4 className="font-bold text-sm text-slate-700">
                {activeTab === 'public' ? 'No public work snapshots published yet' : 'No private screenshots in your system yet'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {activeTab === 'public'
                  ? 'Screenshots published for Public Works are visible to all room members and saved here.'
                  : 'Screenshots saved in your own system are stored privately and never published to the room.'}
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
                  Capture New Screenshot
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentList.map((work, idx) => {
                if (!work) return null;
                const workId = work.id || `work_${idx}`;
                const workTitle = work.title || 'Untitled Snapshot';
                const workAuthor = work.author_name || 'User';
                const workTime = work.timestamp || '';
                const isPublic = work.is_public !== false;
                const canDelete = isHost || work.author_code === currentUserCode || !isPublic;

                return (
                  <div
                    key={workId}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-violet-300 hover:shadow-md transition overflow-hidden flex flex-col"
                  >
                    {/* Image Preview Box */}
                    <div
                      onClick={() => setSelectedImage(work)}
                      className="relative h-44 bg-slate-100 border-b border-slate-100 overflow-hidden cursor-pointer"
                    >
                      <img
                        src={work.image_data || ''}
                        alt={workTitle}
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
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-bold text-xs text-slate-800 truncate" title={workTitle}>
                            {workTitle}
                          </h4>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                            isPublic ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isPublic ? 'Public' : 'Private'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <User className="w-3 h-3 text-violet-500" />
                            {workAuthor}
                          </span>
                          <span className="flex items-center gap-1 font-mono text-[10px]">
                            <Clock className="w-3 h-3" />
                            {workTime}
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
                              if (onDeleteWork) onDeleteWork(workId, isPublic);
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

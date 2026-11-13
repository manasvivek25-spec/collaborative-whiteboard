import React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'teal',
  onConfirm,
  onClose
}) {
  if (!isOpen) return null;

  const colorStyles = {
    teal: 'bg-teal-600 hover:bg-teal-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    amber: 'bg-amber-600 hover:bg-amber-700 text-white'
  };

  const btnClass = colorStyles[confirmColor] || colorStyles.teal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 animate-scale-up">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${confirmColor === 'red' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-slate-800">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {message && <p className="text-xs text-slate-600 mb-4 leading-relaxed whitespace-pre-line">{message}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer ${btnClass}`}
          >
            <Check className="w-3.5 h-3.5" />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

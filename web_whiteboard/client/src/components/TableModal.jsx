import React, { useState } from 'react';
import { Table, X, Check } from 'lucide-react';

export default function TableModal({ isOpen, onClose, onCreateTable }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const r = Math.max(1, Math.min(20, parseInt(rows) || 3));
    const c = Math.max(1, Math.min(20, parseInt(cols) || 3));
    onCreateTable(r, c);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 animate-fade-in">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Insert Table</h3>
              <p className="text-xs text-slate-500">Mention rows and columns to generate</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Number of Rows
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={rows}
                onChange={(e) => setRows(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Number of Columns
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={cols}
                onChange={(e) => setCols(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-center"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-xs text-slate-600 font-medium">
            Preview: <span className="font-bold text-blue-600 ml-1.5">{rows} rows &times; {cols} columns</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

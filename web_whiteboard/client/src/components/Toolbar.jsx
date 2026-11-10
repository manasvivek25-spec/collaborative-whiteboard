import React, { useState } from 'react';
import {
  Pencil,
  Brush,
  Highlighter,
  Eraser,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Diamond,
  Star,
  Type,
  StickyNote,
  Sparkles,
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';

const COLORS = [
  '#000000', '#ef4444', '#f97316', '#eab308', 
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'
];

const STROKE_WIDTHS = [2, 4, 8, 14, 24];

export default function Toolbar({
  activeTool,
  setActiveTool,
  activeShape,
  setActiveShape,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  onUndo,
  onRedo,
  onClearCanvas,
  onInkToFont,
  canUndo = false,
  canRedo = false,
  zoom = 1,
  setZoom,
  canDraw = true
}) {
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const shapes = [
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'line', label: 'Line', icon: Minus },
    { id: 'arrow', label: 'Arrow', icon: ArrowRight },
    { id: 'diamond', label: 'Diamond', icon: Diamond },
    { id: 'star', label: 'Star', icon: Star },
  ];

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80">
      {/* Primary Drawing Tools */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
        <button
          onClick={() => setActiveTool('pencil')}
          title="Pencil"
          className={`p-2 rounded-xl transition ${activeTool === 'pencil' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('brush')}
          title="Smooth Calligraphy Brush"
          className={`p-2 rounded-xl transition ${activeTool === 'brush' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Brush className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('highlighter')}
          title="Highlighter"
          className={`p-2 rounded-xl transition ${activeTool === 'highlighter' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Highlighter className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('eraser')}
          title="Eraser"
          className={`p-2 rounded-xl transition ${activeTool === 'eraser' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>

      {/* Shapes & Objects */}
      <div className="relative flex items-center gap-1 pr-2 border-r border-slate-200">
        <button
          onClick={() => {
            setActiveTool('shape');
            setShowShapeMenu(!showShapeMenu);
          }}
          title="Shapes"
          className={`p-2 rounded-xl flex items-center gap-1 transition ${activeTool === 'shape' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {(() => {
            const S = shapes.find(s => s.id === activeShape)?.icon || Square;
            return <S className="w-4 h-4" />;
          })()}
        </button>

        {showShapeMenu && (
          <div className="absolute top-12 left-0 p-2 bg-white rounded-xl shadow-xl border border-slate-200 grid grid-cols-3 gap-1 z-50 animate-fade-in w-36">
            {shapes.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveShape(s.id);
                    setActiveTool('shape');
                    setShowShapeMenu(false);
                  }}
                  title={s.label}
                  className={`p-2 rounded-lg flex justify-center hover:bg-slate-100 transition ${activeShape === s.id && activeTool === 'shape' ? 'bg-blue-100 text-blue-700' : 'text-slate-700'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setActiveTool('text')}
          title="Text Box"
          className={`p-2 rounded-xl transition ${activeTool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Type className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('sticky')}
          title="Sticky Note"
          className={`p-2 rounded-xl transition ${activeTool === 'sticky' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        {/* Ink-To-Font Recognition Button */}
        <button
          onClick={onInkToFont}
          title="Ink to Font: Convert handwriting to text typography"
          className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
          <span>Ink to Text</span>
        </button>
      </div>

      {/* Colors & Stroke Width */}
      <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
        <div className="flex items-center gap-1">
          {COLORS.slice(0, 5).map((col) => (
            <button
              key={col}
              onClick={() => setStrokeColor(col)}
              style={{ backgroundColor: col }}
              className={`w-5 h-5 rounded-full border border-slate-300 transition ${strokeColor === col ? 'ring-2 ring-blue-600 scale-110' : 'hover:scale-105'}`}
            />
          ))}
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            title="Custom Color"
            className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0"
          />
        </div>

        {/* Width selection */}
        <div className="flex items-center gap-1 ml-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              className={`w-5 h-5 flex items-center justify-center rounded-lg transition ${strokeWidth === w ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <div
                style={{ width: Math.min(14, w * 1.5), height: Math.min(14, w * 1.5) }}
                className="rounded-full bg-current"
              />
            </button>
          ))}
        </div>
      </div>

      {/* History & Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className={`p-2 rounded-xl transition ${canUndo ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'}`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className={`p-2 rounded-xl transition ${canRedo ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'}`}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 px-1 text-slate-500 text-xs font-mono">
          <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))} className="p-1 hover:text-slate-800">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3.0, zoom + 0.1))} className="p-1 hover:text-slate-800">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={onClearCanvas}
          title="Clear Board"
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}


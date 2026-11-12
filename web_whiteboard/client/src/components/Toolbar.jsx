import React from 'react';
import {
  Pencil,
  Brush,
  Highlighter,
  Eraser,
  Square,
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
  Table as TableIcon,
  Grid3X3,
  Hand,
  Lock,
  RotateCcw,
  SquareDashedMousePointer
} from 'lucide-react';
import { SHAPES_LIST } from './ShapesModal';

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
  fillShape = false,
  setFillShape,
  fillColor = '#3b82f6',
  setFillColor,
  gridMode = 'square',
  setGridMode,
  onCycleGrid,
  onUndo,
  onRedo,
  onClearCanvas,
  onInkToFont,
  onOpenTableModal,
  onOpenShapesModal,
  onResetView,
  canUndo = false,
  canRedo = false,
  zoom = 1,
  setZoom,
  canDraw = true,
  hasTopBanner = false
}) {
  return (
    <div className={`fixed ${hasTopBanner ? 'top-[106px] sm:top-[112px]' : 'top-16 sm:top-18'} left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 max-w-[95vw] overflow-x-auto scrollbar-none transition-all duration-200`}>
      
      {/* Blocked indicator if Host disabled drawing */}
      {!canDraw && (
        <div className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 mr-1 whitespace-nowrap">
          <Lock className="w-3.5 h-3.5" />
          <span>View Only</span>
        </div>
      )}

      {/* Selection Tool */}
      <button
        onClick={() => setActiveTool('select')}
        title="Selection Tool (V or S): Select, drag, resize, or delete elements"
        className={`p-2 rounded-xl transition ${activeTool === 'select' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <SquareDashedMousePointer className="w-4 h-4" />
      </button>

      {/* Pan / Hand Tool for Infinite Canvas */}
      <button
        onClick={() => setActiveTool('pan')}
        title="Pan / Hand Tool (H): Drag canvas infinitely"
        className={`p-2 rounded-xl transition ${activeTool === 'pan' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <Hand className="w-4 h-4" />
      </button>

      {/* Primary Drawing Tools */}
      <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200">
        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('pencil')}
          title="Pencil"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'pencil' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('brush')}
          title="Smooth Calligraphy Brush"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'brush' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Brush className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('highlighter')}
          title="Highlighter"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'highlighter' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Highlighter className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('eraser')}
          title="Eraser (Erases ink without touching grid)"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'eraser' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>

      {/* Shapes & Objects */}
      <div className="relative flex items-center gap-1 pr-1.5 border-r border-slate-200">
        {/* Shape Picker Button */}
        <button
          disabled={!canDraw}
          onClick={() => {
            if (!canDraw) return;
            setActiveTool('shape');
            onOpenShapesModal();
          }}
          title={`Shape: ${activeShape} (Click to pick shapes)`}
          className={`p-2 rounded-xl flex items-center gap-1 transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'shape' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {(() => {
            const shapeObj = SHAPES_LIST.find(s => s.id === activeShape);
            const Icon = shapeObj?.icon || Square;
            return <Icon className="w-4 h-4" />;
          })()}
        </button>

        {/* Fill Shape Toggle */}
        <button
          disabled={!canDraw}
          onClick={() => setFillShape && setFillShape(!fillShape)}
          title={fillShape ? `Fill Shape: ON (${fillColor})` : 'Fill Shape: OFF (Outline only)'}
          className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
            !canDraw ? 'opacity-40 cursor-not-allowed' :
            fillShape ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <div
            style={{ backgroundColor: fillShape ? fillColor : 'transparent' }}
            className="w-3.5 h-3.5 rounded border border-slate-400 shrink-0"
          />
          <span className="hidden md:inline text-[10px]">Fill</span>
        </button>

        {/* Table Tool */}
        <button
          disabled={!canDraw}
          onClick={() => {
            if (!canDraw) return;
            onOpenTableModal();
          }}
          title="Insert Table Grid (Enter Rows x Columns)"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'table' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TableIcon className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('text')}
          title="Text Box"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Type className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
          onClick={() => setActiveTool('sticky')}
          title="Sticky Note"
          className={`p-2 rounded-xl transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed text-slate-400' :
            activeTool === 'sticky' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        {/* Ink-To-Font Recognition Button */}
        <button
          disabled={!canDraw}
          onClick={onInkToFont}
          title="Ink to Font: Convert handwriting to typography"
          className={`px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition whitespace-nowrap ${
            !canDraw ? 'opacity-40 cursor-not-allowed' : 'hover:from-violet-700 hover:to-indigo-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
          <span className="hidden sm:inline">Ink to Text</span>
        </button>
      </div>

      {/* Grid Style Cycler (1-Click Cycle: Square -> Dot -> Ruled -> None) */}
      <div className="pr-1.5 border-r border-slate-200">
        <button
          disabled={!canDraw}
          onClick={onCycleGrid}
          title={canDraw ? `Canvas Grid: ${gridMode.toUpperCase()} (Click to cycle None / Square / Dot / Ruled)` : 'Canvas grid changes restricted by Host'}
          className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition ${
            !canDraw ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <Grid3X3 className="w-4 h-4 text-blue-600" />
          <span className="capitalize">{gridMode}</span>
        </button>
      </div>

      {/* Colors & Stroke Width */}
      <div className="flex items-center gap-1.5 pr-1.5 border-r border-slate-200">
        <div className="flex items-center gap-1">
          {COLORS.slice(0, 4).map((col) => (
            <button
              key={col}
              disabled={!canDraw}
              onClick={() => setStrokeColor(col)}
              style={{ backgroundColor: col }}
              className={`w-5 h-5 rounded-full border border-slate-300 transition ${strokeColor === col ? 'ring-2 ring-blue-600 scale-110' : 'hover:scale-105'}`}
            />
          ))}
          <input
            type="color"
            disabled={!canDraw}
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            title="Custom Color"
            className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0"
          />
        </div>

        {/* Width selection */}
        <div className="flex items-center gap-0.5 ml-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              disabled={!canDraw}
              onClick={() => setStrokeWidth(w)}
              className={`w-5 h-5 flex items-center justify-center rounded-lg transition ${strokeWidth === w ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <div
                style={{ width: Math.min(12, w * 1.5), height: Math.min(12, w * 1.5) }}
                className="rounded-full bg-current"
              />
            </button>
          ))}
        </div>
      </div>

      {/* History, Zoom & View Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo || !canDraw}
          title="Undo (Ctrl+Z)"
          className={`p-2 rounded-xl transition ${canUndo && canDraw ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'}`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo || !canDraw}
          title="Redo (Ctrl+Y)"
          className={`p-2 rounded-xl transition ${canRedo && canDraw ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'}`}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-0.5 px-1 text-slate-500 text-xs font-mono">
          <button onClick={() => setZoom(Math.max(0.2, zoom - 0.1))} className="p-1 hover:text-slate-800">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3.0, zoom + 0.1))} className="p-1 hover:text-slate-800">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center / Reset View */}
        <button
          onClick={onResetView}
          title="Center Canvas (Reset Pan & Zoom)"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          disabled={!canDraw}
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

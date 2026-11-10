import React from 'react';
import {
  Square,
  Circle,
  Minus,
  ArrowRight,
  Diamond,
  Star,
  Triangle,
  RectangleHorizontal,
  X,
  Check
} from 'lucide-react';

export const SHAPES_LIST = [
  { id: 'rect', label: 'Rectangle', icon: Square, desc: 'Sharp box' },
  { id: 'rounded_rect', label: 'Rounded Box', icon: RectangleHorizontal, desc: 'Smooth curved corners' },
  { id: 'circle', label: 'Circle / Oval', icon: Circle, desc: 'Perfect ellipse or circle' },
  { id: 'triangle', label: 'Triangle', icon: Triangle, desc: 'Isosceles polygon' },
  { id: 'diamond', label: 'Diamond', icon: Diamond, desc: 'Rhombus decision shape' },
  { id: 'star', label: '5-Point Star', icon: Star, desc: 'Star polygon badge' },
  { id: 'line', label: 'Straight Line', icon: Minus, desc: 'Direct vector rule' },
  { id: 'arrow', label: 'Directed Arrow', icon: ArrowRight, desc: 'Connector pointer' },
];

export default function ShapesModal({
  isOpen,
  onClose,
  activeShape,
  onSelectShape
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Square className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Vector Shapes Gallery</h3>
              <p className="text-xs text-slate-500">Pick a shape to draw on the canvas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 my-2">
          {SHAPES_LIST.map((s) => {
            const Icon = s.icon;
            const isSelected = activeShape === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  onSelectShape(s.id);
                  onClose();
                }}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/80 shadow-xs'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-slate-800 flex items-center justify-between">
                    <span className="truncate">{s.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

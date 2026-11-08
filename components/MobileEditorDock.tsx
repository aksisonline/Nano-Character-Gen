import React from 'react';
import { Download, Code, Eraser, Pencil, Pipette, Plus, SlidersHorizontal, X } from 'lucide-react';
import { ToolMode } from '../types';
import { isMagentaLikeHex } from '../services/imageProcessingService';
import { CHECKER_SVG } from './PalettePanel';
import GeneratePanel from './GeneratePanel';

interface DockProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  palette: (string | null)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onUpdateColor: (index: number, color: string) => void;
  onAddColor: () => void;
  onOpenMore: () => void;
}

const TOOLS = [
  { mode: ToolMode.PENCIL, icon: Pencil, label: 'Draw' },
  { mode: ToolMode.ERASER, icon: Eraser, label: 'Erase' },
  { mode: ToolMode.PICKER, icon: Pipette, label: 'Pick' },
];

/** Thumb-zone tool + palette strip shown under the canvas on phones. */
export const MobileEditorDock: React.FC<DockProps> = ({
  toolMode, onToolModeChange, palette, selectedIndex, onSelect, onUpdateColor, onAddColor, onOpenMore,
}) => (
  <div className="shrink-0 border-t-4 border-amber-900/80 bg-[#141414]">
    <div className="flex gap-2 px-3 pt-3">
      {TOOLS.map((tool) => {
        const active = toolMode === tool.mode;
        return (
          <button
            key={tool.mode}
            type="button"
            onClick={() => onToolModeChange(tool.mode)}
            aria-pressed={active}
            className={`game-button game-interactive game-focus-pixel retro flex h-12 flex-1 flex-col items-center justify-center gap-0.5 border-2 text-[10px] ${
              active ? 'border-amber-400 bg-amber-700 text-white' : 'border-gray-700 bg-[#1a1a1a] text-gray-300'
            }`}
          >
            <tool.icon size={16} />
            {tool.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        aria-label="More: generate, download, JSON"
        className="game-button game-interactive game-focus-pixel retro flex h-12 flex-1 flex-col items-center justify-center gap-0.5 border-2 border-gray-700 bg-[#1a1a1a] text-[10px] text-gray-300"
      >
        <SlidersHorizontal size={16} />
        More
      </button>
    </div>
    <div className="game-scroll flex gap-2 overflow-x-auto px-3 py-3" style={{ touchAction: 'pan-x' }} aria-label="Palette">
      {palette.map((color, index) => {
        const transparent = index === 0 || (color != null && isMagentaLikeHex(color));
        const selected = selectedIndex === index;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={transparent ? 'Transparent' : `Color ${index}`}
            aria-pressed={selected}
            className="game-button game-focus-pixel tap-auto relative size-11 shrink-0 border-2"
            style={{ borderColor: selected ? '#fff' : '#3f3f46', boxShadow: selected ? '0 0 0 2px #f59e0b' : undefined }}
          >
            {transparent ? (
              <span className="absolute inset-0 opacity-60" style={{ backgroundImage: CHECKER_SVG, backgroundSize: '8px 8px' }} />
            ) : (
              <>
                <span className="absolute inset-0" style={{ backgroundColor: color ?? 'transparent' }} />
                {selected && (
                  <input
                    type="color"
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    value={color ?? '#000000'}
                    onChange={(e) => onUpdateColor(index, e.target.value)}
                    aria-label={`Edit color ${index}`}
                  />
                )}
              </>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAddColor}
        aria-label="Add color"
        className="game-button game-focus-pixel tap-auto flex size-11 shrink-0 items-center justify-center border-2 border-dashed border-gray-600 text-gray-400"
      >
        <Plus size={18} />
      </button>
    </div>
  </div>
);

interface SheetProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onConfirmAndAnimate: () => void;
  onDownloadPng: () => void;
  showJson: boolean;
  onToggleJson: () => void;
  onBackToCreate: () => void;
}

/** Bottom sheet holding the generate / export actions that don't fit the dock. */
export const MobileEditorSheet: React.FC<SheetProps> = (props) => {
  if (!props.open) return null;
  const act = (fn: () => void) => () => { props.onClose(); fn(); };
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Sprite actions">
      <button type="button" className="tap-auto absolute inset-0 bg-black/70" aria-label="Close" onClick={props.onClose} />
      <div className="sheet-enter relative flex max-h-[85dvh] flex-col border-t-4 border-amber-900/80 bg-[#141414]">
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <button type="button" onClick={act(props.onBackToCreate)} className="game-interactive text-xs text-gray-400">← Back to create</button>
          <button type="button" onClick={props.onClose} aria-label="Close" className="game-interactive flex items-center justify-center text-gray-400"><X size={20} /></button>
        </div>
        <div className="game-scroll flex flex-col gap-3 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={props.onDownloadPng} className="game-button game-interactive retro flex items-center justify-center gap-2 border-2 border-gray-700 bg-[#1a1a1a] px-2 text-[10px] text-gray-200">
              <Download size={14} /> PNG
            </button>
            <button type="button" onClick={act(props.onToggleJson)} className="game-button game-interactive retro flex items-center justify-center gap-2 border-2 border-gray-700 bg-[#1a1a1a] px-2 text-[10px] text-gray-200">
              <Code size={14} /> {props.showJson ? 'Hide' : 'View'} JSON
            </button>
          </div>
          <GeneratePanel
            prompt={props.prompt}
            onPromptChange={props.onPromptChange}
            isGenerating={props.isGenerating}
            error={props.error}
            onGenerate={props.onGenerate}
            onConfirmAndAnimate={act(props.onConfirmAndAnimate)}
          />
        </div>
      </div>
    </div>
  );
};

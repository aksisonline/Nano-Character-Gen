import React from 'react';
import { Download, Code, Plus, SlidersHorizontal, X } from 'lucide-react';
import { CurrentColor, isPaintableColor, paintableIndices } from './PalettePanel';
import { EditorDockTools, type EditorToolbarProps } from './EditorToolbar';
import GeneratePanel from './GeneratePanel';

interface DockProps extends EditorToolbarProps {
  palette: (string | null)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onUpdateColor: (index: number, color: string) => void;
  onAddColor: () => void;
  onOpenMore: () => void;
}

/** Thumb-zone tool + palette strip shown under the canvas on phones. */
export const MobileEditorDock: React.FC<DockProps> = ({
  palette, selectedIndex, onSelect, onUpdateColor, onAddColor, onOpenMore, ...tools
}) => (
  <div className="shrink-0 border-t-4 border-amber-900/80 bg-[#141414]">
    <EditorDockTools
      {...tools}
      more={
        <button
          type="button"
          onClick={onOpenMore}
          aria-label="More: generate, download, JSON"
          className="game-button game-focus-pixel tap-auto flex h-11 min-w-11 flex-1 items-center justify-center border-2 border-gray-600 bg-[#1f1f1f] text-gray-200"
        >
          <SlidersHorizontal size={16} aria-hidden />
        </button>
      }
    />
    <div className="flex items-center gap-2 px-3 py-3">
      {isPaintableColor(palette, selectedIndex) && (
        <CurrentColor compact palette={palette} index={selectedIndex} onUpdateColor={onUpdateColor} />
      )}
      <div className="game-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto p-1" style={{ touchAction: 'pan-x' }} role="group" aria-label="Palette colors">
        {paintableIndices(palette).map((index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Color ${index}, ${palette[index]}`}
              aria-pressed={selected}
              className="game-button game-focus-pixel tap-auto relative size-11 shrink-0 border-2"
              style={{ backgroundColor: palette[index]!, borderColor: selected ? '#fff' : '#3f3f46', boxShadow: selected ? '0 0 0 2px #000, 0 0 0 4px #f59e0b' : undefined }}
            >
              {selected && <span aria-hidden className="absolute bottom-0 right-0 size-2 bg-white" style={{ outline: '1px solid #000' }} />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddColor}
          aria-label="Add color"
          className="game-button game-focus-pixel tap-auto flex size-11 shrink-0 items-center justify-center border-2 border-dashed border-gray-500 text-gray-300"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
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

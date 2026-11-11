import React from 'react';
import { Eraser, FlipHorizontal2, PaintBucket, Pencil, Pipette, Redo2, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { ToolMode } from '../types';

export interface ToolDef {
  mode: ToolMode;
  icon: LucideIcon;
  label: string;
  key: string;
  hint: string;
}

export const TOOL_DEFS: ToolDef[] = [
  { mode: ToolMode.PENCIL, icon: Pencil, label: 'Brush', key: 'B', hint: 'Draw with the current color. Shift+drag draws a line.' },
  { mode: ToolMode.ERASER, icon: Eraser, label: 'Eraser', key: 'E', hint: 'Erase to transparent.' },
  { mode: ToolMode.FILL, icon: PaintBucket, label: 'Fill', key: 'G', hint: 'Fill a region. Shift or Alt replaces that color everywhere.' },
  { mode: ToolMode.PICKER, icon: Pipette, label: 'Pick', key: 'I', hint: 'Pick a color from the sprite. Right-click also picks.' },
];

export const toolTitle = (t: ToolDef) => `${t.label} (${t.key}): ${t.hint}`;

export interface EditorToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  mirror: boolean;
  onMirrorChange: (value: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const SIZES = [1, 2, 3];
const ring = 'game-focus-pixel';
const idle = 'border-gray-600 bg-[#1f1f1f] text-gray-200 hover:border-gray-400';
const on = 'border-amber-400 bg-amber-700 text-white';

function describe(p: EditorToolbarProps) {
  const t = TOOL_DEFS.find((d) => d.mode === p.toolMode)!;
  const sized = p.toolMode === ToolMode.PENCIL || p.toolMode === ToolMode.ERASER;
  return `${t.label}${sized ? `, ${p.brushSize}px` : ''}${p.mirror ? ', mirrored' : ''}`;
}

/** Small icon-only action button (undo / redo / mirror / clear). */
const IconAction: React.FC<{
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; title?: string; dock?: boolean;
}> = ({ icon: Icon, label, onClick, disabled, pressed, title, dock }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={pressed}
    title={title ?? label}
    className={`game-button ${ring} flex flex-1 items-center justify-center border-2 disabled:opacity-40 ${dock ? 'h-11 min-w-11' : 'h-10'} ${pressed ? on : idle}`}
  >
    <Icon size={16} aria-hidden />
    {pressed !== undefined && <span className="ml-1 text-[9px] font-bold" aria-hidden>{pressed ? 'ON' : 'OFF'}</span>}
  </button>
);

const SizeSelect: React.FC<{ p: EditorToolbarProps; dock?: boolean }> = ({ p, dock }) => {
  const enabled = p.toolMode === ToolMode.PENCIL || p.toolMode === ToolMode.ERASER;
  return (
    <div role="group" aria-label="Brush size" className="flex items-center gap-1">
      {!dock && <span className="mr-1 text-[10px] uppercase tracking-wider text-gray-400">Size</span>}
      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={!enabled}
          aria-pressed={p.brushSize === s}
          aria-label={`Brush size ${s}`}
          title={`Brush size ${s} (${s === 1 ? '[' : ']'} to change)`}
          onClick={() => p.onBrushSizeChange(s)}
          className={`game-button ${ring} flex ${dock ? 'h-11 min-w-11' : 'h-8 flex-1'} items-center justify-center gap-1 border-2 text-[10px] font-bold disabled:opacity-40 ${p.brushSize === s ? on : idle}`}
        >
          <span aria-hidden className="block bg-current" style={{ width: 3 + s * 3, height: 3 + s * 3 }} />
          {s}
        </button>
      ))}
    </div>
  );
};

/** Desktop tool card for the left panel. */
export const EditorToolPanel: React.FC<EditorToolbarProps> = (p) => (
  <section aria-label="Drawing tools" className="border-2 border-amber-900/60 bg-[#1a1a1a] p-3">
    <h2 className="retro mb-2 text-xs text-gray-200">Tools</h2>
    <div role="group" aria-label="Tool" className="grid grid-cols-2 gap-2">
      {TOOL_DEFS.map((t) => {
        const active = p.toolMode === t.mode;
        return (
          <button
            key={t.mode}
            type="button"
            onClick={() => p.onToolModeChange(t.mode)}
            aria-pressed={active}
            aria-keyshortcuts={t.key}
            title={toolTitle(t)}
            className={`game-button ${ring} relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 border-2 px-1 ${active ? on : idle}`}
          >
            <t.icon size={18} aria-hidden />
            <span className="retro text-[10px]">{t.label}</span>
            <kbd className={`absolute right-1 top-1 border px-1 text-[9px] font-bold leading-tight ${active ? 'border-white/60' : 'border-gray-500 text-gray-300'}`} aria-hidden>{t.key}</kbd>
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white" />}
          </button>
        );
      })}
    </div>
    <div className="mt-2"><SizeSelect p={p} /></div>
    <div className="mt-2 flex gap-2">
      <IconAction icon={Undo2} label="Undo" title="Undo (Ctrl/Cmd+Z)" onClick={p.onUndo} disabled={!p.canUndo} />
      <IconAction icon={Redo2} label="Redo" title="Redo (Shift+Ctrl/Cmd+Z or Ctrl+Y)" onClick={p.onRedo} disabled={!p.canRedo} />
      <IconAction icon={FlipHorizontal2} label="Mirror horizontally" title="Mirror horizontally (M)" pressed={p.mirror} onClick={() => p.onMirrorChange(!p.mirror)} />
      <IconAction icon={Trash2} label="Clear canvas (undoable)" title="Clear canvas (undoable)" onClick={p.onClear} />
    </div>
    <p role="status" aria-live="polite" className="mt-2 text-[10px] text-gray-300">Active: {describe(p)}</p>
    <p className="mt-1 text-[10px] leading-relaxed text-gray-400">Right-click picks a color. Shift+drag draws a line. Shift+Fill replaces a color everywhere. [ ] change size.</p>
  </section>
);

/** Thumb-zone toolbar for phones: tools + history row, size / mirror / clear row. */
export const EditorDockTools: React.FC<EditorToolbarProps & { more: React.ReactNode }> = ({ more, ...p }) => (
  <div className="flex flex-col gap-2 px-3 pt-3">
    <div className="flex gap-2">
      <div role="group" aria-label="Tool" className="flex flex-[4] gap-1">
        {TOOL_DEFS.map((t) => {
          const active = p.toolMode === t.mode;
          return (
            <button
              key={t.mode}
              type="button"
              onClick={() => p.onToolModeChange(t.mode)}
              aria-pressed={active}
              aria-label={t.label}
              className={`game-button ${ring} tap-auto relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 border-2 ${active ? on : idle}`}
            >
              <t.icon size={16} aria-hidden />
              <span className="text-[9px] font-bold">{t.label}</span>
              {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-[1.2] gap-1">
        <IconAction dock icon={Undo2} label="Undo" onClick={p.onUndo} disabled={!p.canUndo} />
        <IconAction dock icon={Redo2} label="Redo" onClick={p.onRedo} disabled={!p.canRedo} />
      </div>
    </div>
    <div className="flex items-center gap-1">
      <SizeSelect p={p} dock />
      <div className="ml-auto flex gap-1">
        <IconAction dock icon={FlipHorizontal2} label="Mirror horizontally" pressed={p.mirror} onClick={() => p.onMirrorChange(!p.mirror)} />
        <IconAction dock icon={Trash2} label="Clear canvas (undoable)" onClick={p.onClear} />
        {more}
      </div>
    </div>
  </div>
);

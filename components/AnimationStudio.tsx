import React, { useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { SpriteAnimation } from '../types';
import { ANIMATION_PRESETS, DEFAULT_FPS, DEFAULT_FRAME_COUNT, DEFAULT_GIF_EXPORT_SCALE, FPS_OPTIONS, FRAME_COUNT_OPTIONS, GIF_EXPORT_SCALES } from '../constants';
import AnimationPreview from './AnimationPreview';

interface AnimationStudioProps {
  animations: SpriteAnimation[];
  palette: (string | null)[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (animation: Omit<SpriteAnimation, 'status'>) => void;
  onUpdate: (id: string, updates: Partial<SpriteAnimation>) => void;
  onDelete: (id: string) => void;
  onGenerate: (id: string) => void;
  onExport: (id: string, scale: number) => void;
  onExportAll: (scale: number) => void;
  isGenerating: boolean;
  error: string | null;
}

const fieldClass = 'w-full rounded-none border border-amber-900/60 bg-[#0d0d0d] px-2 py-2 text-xs text-gray-200 retro game-focus-pixel';
const buttonClass = 'game-button game-interactive rounded border border-amber-900/60 px-3 py-2 text-[10px] font-bold text-amber-300 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-50';

const AnimationStudio: React.FC<AnimationStudioProps> = ({
  animations,
  palette,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onGenerate,
  onExport,
  onExportAll,
  isGenerating,
  error,
}) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frameCount, setFrameCount] = useState(DEFAULT_FRAME_COUNT);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [loop, setLoop] = useState(true);
  const [gifScale, setGifScale] = useState(DEFAULT_GIF_EXPORT_SCALE);
  const selectedAnimation = useMemo(
    () => animations.find((animation) => animation.id === selectedId) ?? null,
    [animations, selectedId]
  );

  const addAnimation = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanPrompt = prompt.trim();
    if (!cleanName || !cleanPrompt) return;
    const id = crypto.randomUUID();
    onAdd({ id, name: cleanName, prompt: cleanPrompt, frameCount, fps, loop, frames: [] });
    onSelect(id);
    setName('');
    setPrompt('');
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[#0d0d0d] text-gray-200">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r-4 border-amber-900/70 bg-[#141414] p-4">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="retro text-sm font-bold text-amber-300">Animations</h2>
            <span className="text-[10px] text-gray-500">{animations.length} defined</span>
          </div>
          <div className="flex flex-col gap-2">
            {animations.map((animation) => (
              <div key={animation.id} className={`flex items-center gap-2 rounded border p-2 ${selectedId === animation.id ? 'border-amber-500 bg-amber-950/25' : 'border-gray-800 bg-black/30'}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(animation.id)}>
                  <span className="block truncate text-xs font-bold text-gray-200">{animation.name}</span>
                  <span className="block text-[10px] text-gray-500">
                    {animation.frames.length ? `${animation.frames.length} frames` : `${animation.frameCount} frames · not generated`} · {animation.fps} FPS
                  </span>
                  {animation.status === 'generating' && <span className="text-[10px] text-amber-400">Generating…</span>}
                  {animation.status === 'error' && <span className="text-[10px] text-red-400">Generation failed</span>}
                </button>
                <button type="button" className="p-1 text-gray-500 hover:text-red-400" onClick={() => onDelete(animation.id)} aria-label={`Delete ${animation.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!animations.length && <p className="rounded border border-dashed border-gray-700 p-3 text-xs text-gray-500">Define your first animation below.</p>}
          </div>
        </section>

        <form onSubmit={addAnimation} className="flex flex-col gap-3 border-t border-gray-800 pt-4">
          <h3 className="retro text-xs font-bold text-gray-300">Define an animation</h3>
          <label className="grid gap-1 text-[10px] text-gray-400">
            Name
            <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Attack" maxLength={40} required />
          </label>
          <label className="grid gap-1 text-[10px] text-gray-400">
            Motion description
            <textarea className={`${fieldClass} min-h-20 resize-y`} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the movement and how it should end…" maxLength={500} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px] text-gray-400">
              Frames
              <select className={fieldClass} value={frameCount} onChange={(event) => setFrameCount(Number(event.target.value))}>
                {FRAME_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[10px] text-gray-400">
              Playback FPS
              <select className={fieldClass} value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                {FPS_OPTIONS.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[10px] text-gray-400">
            <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
            Loop continuously
          </label>
          <button type="submit" className={`${buttonClass} flex items-center justify-center gap-2`}>
            <Plus size={13} /> Add animation
          </button>
          <div className="border-t border-gray-800 pt-3">
            <label className="grid gap-1 text-[10px] text-gray-400">
              Quick prompts
              <select className={fieldClass} value="" onChange={(event) => {
                const preset = ANIMATION_PRESETS.find((candidate) => candidate.name === event.target.value);
                if (preset) {
                  setName(preset.name);
                  setPrompt(preset.prompt);
                }
              }}>
                <option value="">Choose a prompt…</option>
                {ANIMATION_PRESETS.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
              </select>
            </label>
          </div>
        </form>

        <section className="mt-auto border-t border-gray-800 pt-4">
          <label className="mb-3 grid gap-1 text-[10px] text-gray-400">
            GIF scale
            <select className={fieldClass} value={gifScale} onChange={(event) => setGifScale(Number(event.target.value))}>
              {GIF_EXPORT_SCALES.map((scale) => <option key={scale} value={scale}>{scale}× ({32 * scale}×{48 * scale} px)</option>)}
            </select>
          </label>
          <button type="button" className={`${buttonClass} flex w-full items-center justify-center gap-2`} onClick={() => onExportAll(gifScale)} disabled={!animations.some((animation) => animation.frames.length)}>
            <Download size={13} /> Export all GIFs
          </button>
        </section>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        {error && <div role="alert" className="w-full max-w-2xl rounded border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>}
        {selectedAnimation ? (
          <>
            <div className="w-full max-w-3xl">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 grid max-w-2xl gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-[10px] text-gray-400">
                      Animation name
                      <input className={fieldClass} value={selectedAnimation.name} maxLength={40} disabled={isGenerating}
                        onChange={(event) => onUpdate(selectedAnimation.id, { name: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-[10px] text-gray-400">
                      Frames
                      <select className={fieldClass} value={selectedAnimation.frameCount} disabled={isGenerating}
                        onChange={(event) => onUpdate(selectedAnimation.id, {
                          frameCount: Number(event.target.value), frames: [], status: 'empty',
                        })}>
                        {FRAME_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[10px] text-gray-400 sm:col-span-2">
                      Motion description
                      <textarea className={`${fieldClass} min-h-16 resize-y`} value={selectedAnimation.prompt} maxLength={500} disabled={isGenerating}
                        onChange={(event) => onUpdate(selectedAnimation.id, { prompt: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-[10px] text-gray-400">
                      Playback FPS
                      <select className={fieldClass} value={selectedAnimation.fps} disabled={isGenerating}
                        onChange={(event) => onUpdate(selectedAnimation.id, { fps: Number(event.target.value) })}>
                        {FPS_OPTIONS.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-[10px] text-gray-400">
                      <input type="checkbox" checked={selectedAnimation.loop} disabled={isGenerating}
                        onChange={(event) => onUpdate(selectedAnimation.id, { loop: event.target.checked })} />
                      Loop continuously
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={`${buttonClass} flex items-center gap-2`} onClick={() => onGenerate(selectedAnimation.id)} disabled={isGenerating || !selectedAnimation.name.trim() || !selectedAnimation.prompt.trim()}>
                    {isGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    {selectedAnimation.frames.length ? 'Regenerate' : 'Generate frames'}
                  </button>
                  <button type="button" className={`${buttonClass} flex items-center gap-2`} onClick={() => onExport(selectedAnimation.id, gifScale)} disabled={!selectedAnimation.frames.length}>
                    <Download size={13} /> Export GIF
                  </button>
                </div>
              </div>
              {selectedAnimation.frames.length ? (
                <AnimationPreview
                  frames={selectedAnimation.frames}
                  palette={palette}
                  label={selectedAnimation.name}
                  fps={selectedAnimation.fps}
                  loop={selectedAnimation.loop}
                  scale={6}
                />
              ) : (
                <div className="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center gap-3 rounded border border-dashed border-amber-900/50 p-8 text-center">
                  <Wand2 size={24} className="text-amber-500" />
                  <p className="text-sm text-gray-300">Generate {selectedAnimation.frameCount} frames for this animation.</p>
                  <p className="text-xs text-gray-500">The character sprite and your motion description are used as references.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="max-w-md text-center">
            <h1 className="retro text-lg font-bold text-amber-300">Animation studio</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">Create a named animation, describe its motion, and generate its frames independently. Each clip can be previewed and exported as a transparent GIF.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default AnimationStudio;

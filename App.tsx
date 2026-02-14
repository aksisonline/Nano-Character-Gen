import React, { useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Layers,
  Map as MapIcon,
  User as UserIcon,
} from 'lucide-react';
import { SpriteMatrix, ToolMode, AppPhase, EngineMode } from './types';
import {
  INITIAL_PALETTE,
  EMPTY_MATRIX_PIXELS,
  SPRITE_WIDTH,
  SPRITE_HEIGHT,
  PREVIEW_SCALES,
  DEFAULT_PREVIEW_SCALE,
  GRID_UNIT,
} from './constants';
import { runSpritePipeline } from './services/spritePipeline';
import { generateAnimationSheet } from './services/geminiService';
import { processSpriteSheet, isMagentaLikeHex } from './services/imageProcessingService';
import CharacterPanel from './components/CharacterPanel';
import CharacterCreateView from './components/CharacterCreateView';
import PixelEasel from './components/PixelEasel';
import PalettePanel from './components/PalettePanel';
import AnimationPreview from './components/AnimationPreview';
import WorldEngine from './components/WorldEngine';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';

const emptyMatrix = (): SpriteMatrix => ({
  meta: {
    name: 'init',
    width: SPRITE_WIDTH,
    height: SPRITE_HEIGHT,
    created_at: Date.now(),
    fps: { idle: 0.5, walk: 4, special: 8 },
  },
  palette: [...INITIAL_PALETTE],
  pixels: [...EMPTY_MATRIX_PIXELS],
  matrix: { idle: [], walk: [], jump: [], special: [] },
});

function nextScale(current: number, delta: number): number {
  let idx = PREVIEW_SCALES.indexOf(current as (typeof PREVIEW_SCALES)[number]);
  if (idx < 0) idx = PREVIEW_SCALES.indexOf(DEFAULT_PREVIEW_SCALE);
  const nextIdx = Math.max(0, Math.min(PREVIEW_SCALES.length - 1, idx + delta));
  return PREVIEW_SCALES[nextIdx];
}

const App: React.FC = () => {
  const [engineMode, setEngineMode] = useState<EngineMode>(EngineMode.CHARACTER);
  const [showEditor, setShowEditor] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AppPhase>(AppPhase.EDITOR);
  const [matrix, setMatrix] = useState<SpriteMatrix>(emptyMatrix());
  const [scale, setScale] = useState(DEFAULT_PREVIEW_SCALE);
  const [selectedColorIndex, setSelectedColorIndex] = useState(1);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.PENCIL);
  const [showGrid, setShowGrid] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const [crtOverlay, setCrtOverlay] = useState(false);

  const handleGenerateBase = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError('Missing API Key in environment variables.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    setShowJson(false);
    setPhase(AppPhase.EDITOR);
    try {
      const { pixels, palette } = await runSpritePipeline(prompt);
      setMatrix({
        meta: {
          name: characterName.trim() || 'New_Character',
          width: SPRITE_WIDTH,
          height: SPRITE_HEIGHT,
          created_at: Date.now(),
          fps: { idle: 0.5, walk: 4, special: 8 },
        },
        palette,
        pixels,
        matrix: { idle: [], walk: [], jump: [], special: [] },
      });
      setToolMode(ToolMode.PENCIL);
      setSelectedColorIndex(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate sprite');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, characterName]);

  const handleCreateFromMinimal = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError('Missing API Key.');
      return;
    }
    const description = prompt.trim() || characterName.trim() || '8-bit character';
    setIsGenerating(true);
    setError(null);
    try {
      const { pixels, palette } = await runSpritePipeline(description);
      const name = characterName.trim() || 'Character';
      setMatrix({
        meta: {
          name,
          width: SPRITE_WIDTH,
          height: SPRITE_HEIGHT,
          created_at: Date.now(),
          fps: { idle: 0.5, walk: 4, special: 8 },
        },
        palette,
        pixels,
        matrix: { idle: [], walk: [], jump: [], special: [] },
      });
      setSelectedColorIndex(1);
      setIsGenerating(false);
      setIsAnimating(true);
      generateAnimationSheet(
        (() => {
          const c = document.createElement('canvas');
          c.width = SPRITE_WIDTH;
          c.height = SPRITE_HEIGHT;
          const ctx = c.getContext('2d');
          if (!ctx) return '';
          ctx.imageSmoothingEnabled = false;
          for (let i = 0; i < pixels.length; i++) {
            const color = palette[pixels[i]];
            if (color && !isMagentaLikeHex(color)) {
              ctx.fillStyle = color;
              ctx.fillRect(i % SPRITE_WIDTH, Math.floor(i / SPRITE_WIDTH), 1, 1);
            }
          }
          return c.toDataURL('image/png');
        })(),
        description
      )
        .then((sheetBase64) =>
          processSpriteSheet(sheetBase64, palette, pixels)
        )
        .then((anims) => {
          setMatrix((prev) => ({ ...prev, matrix: anims }));
          setPhase(AppPhase.ANIMATOR);
        })
        .catch(() => {})
        .finally(() => setIsAnimating(false));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create character');
      setIsGenerating(false);
    }
  }, [characterName, prompt]);

  const handleConfirmAndAnimate = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError('Missing API Key.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SPRITE_WIDTH;
      canvas.height = SPRITE_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas init failed');
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < matrix.pixels.length; i++) {
        const color = matrix.palette[matrix.pixels[i]];
        if (color && !isMagentaLikeHex(color)) {
          ctx.fillStyle = color;
          const x = i % SPRITE_WIDTH;
          const y = Math.floor(i / SPRITE_WIDTH);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      const currentSpriteBase64 = canvas.toDataURL('image/png');
      const sheetBase64 = await generateAnimationSheet(currentSpriteBase64, prompt);
      const anims = await processSpriteSheet(
        sheetBase64,
        matrix.palette,
        matrix.pixels
      );
      setMatrix((prev) => ({ ...prev, matrix: anims }));
      setPhase(AppPhase.ANIMATOR);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate animations');
    } finally {
      setIsGenerating(false);
    }
  }, [matrix.pixels, matrix.palette, prompt]);

  const handleUpdatePixel = useCallback((index: number, colorIndex: number) => {
    setMatrix((prev) => {
      const newPixels = [...prev.pixels];
      newPixels[index] = colorIndex;
      return { ...prev, pixels: newPixels };
    });
  }, []);

  const handleUpdatePaletteColor = useCallback((index: number, newHex: string) => {
    setMatrix((prev) => {
      const newPalette = [...prev.palette];
      newPalette[index] = newHex;
      return { ...prev, palette: newPalette };
    });
  }, []);

  const handleAddColor = useCallback(() => {
    setMatrix((prev) => ({
      ...prev,
      palette: [...prev.palette, '#888888'],
    }));
    setSelectedColorIndex(matrix.palette.length);
  }, [matrix.palette.length]);

  const downloadPNG = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_WIDTH;
    canvas.height = SPRITE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < matrix.pixels.length; i++) {
      const color = matrix.palette[matrix.pixels[i]];
      if (color && !isMagentaLikeHex(color)) {
        ctx.fillStyle = color;
        const x = i % SPRITE_WIDTH;
        const y = Math.floor(i / SPRITE_WIDTH);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const link = document.createElement('a');
    link.download = `${prompt.replace(/\s+/g, '_')}_base.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [matrix.pixels, matrix.palette, prompt]);

  if (engineMode === EngineMode.WORLD) {
    return (
      <div className="game-root game-layout">
        <nav
          className="shrink-0 z-50 flex items-center justify-center border-b border-gray-800 bg-black"
          style={{ height: GRID_UNIT * 5 }}
        >
          <div className="flex rounded-lg p-1 gap-1" style={{ gap: GRID_UNIT }}>
            <button
              type="button"
              onClick={() => setEngineMode(EngineMode.CHARACTER)}
              className={`game-button game-interactive flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${
                engineMode === EngineMode.CHARACTER
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <UserIcon size={12} /> CHARACTER
            </button>
            <button
              type="button"
              onClick={() => setEngineMode(EngineMode.WORLD)}
              className={`game-button game-interactive flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${
                engineMode === EngineMode.WORLD
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <MapIcon size={12} /> WORLD
            </button>
          </div>
        </nav>
        <WorldEngine />
      </div>
    );
  }

  const animScale = scale > 6 ? 6 : scale;

  return (
    <div className="game-root game-layout">
      {crtOverlay && <div className="crt-overlay" aria-hidden />}
      <nav
        className="shrink-0 z-50 flex items-center justify-center border-b border-gray-800 bg-black"
        style={{ height: GRID_UNIT * 5 }}
      >
        <div className="flex rounded-lg p-1" style={{ gap: GRID_UNIT }}>
          <button
            type="button"
            onClick={() => setEngineMode(EngineMode.CHARACTER)}
            className={`game-button game-interactive flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${
              engineMode === EngineMode.CHARACTER
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <UserIcon size={12} /> CHARACTER
          </button>
          <button
            type="button"
            onClick={() => setEngineMode(EngineMode.WORLD)}
            className={`game-button game-interactive flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${
              engineMode === EngineMode.WORLD
                ? 'bg-emerald-600 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <MapIcon size={12} /> WORLD
          </button>
        </div>
      </nav>

      {!showEditor ? (
        <CharacterCreateView
          characterName={characterName}
          onNameChange={setCharacterName}
          description={prompt}
          onDescriptionChange={setPrompt}
          onCreate={handleCreateFromMinimal}
          isGenerating={isGenerating}
          isAnimating={isAnimating}
          error={error}
          matrix={matrix}
          scale={scale}
          onEditSprite={() => setShowEditor(true)}
        />
      ) : (
      <div className="game-layout-row bg-[#0d0d0d] text-gray-200 scanline-bg">
        <CharacterPanel
          phase={phase}
          prompt={prompt}
          onPromptChange={setPrompt}
          isGenerating={isGenerating}
          error={error}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          onGenerate={handleGenerateBase}
          onBackToEditor={() => setPhase(AppPhase.EDITOR)}
          onConfirmAndAnimate={handleConfirmAndAnimate}
          onDownloadPng={downloadPNG}
          showJson={showJson}
          onToggleJson={() => setShowJson((v) => !v)}
          onBackToCreate={() => setShowEditor(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div
            className="shrink-0 border-b-4 border-amber-900/60 bg-[#141414]/95 flex items-center justify-between px-4 game-snap"
            style={{ height: GRID_UNIT * 6 }}
          >
            <div className="flex items-center gap-3" style={{ gap: GRID_UNIT * 2 }}>
              <span className="text-xs text-gray-500 font-mono">
                {SPRITE_WIDTH}×{SPRITE_HEIGHT}
              </span>
              <div className="w-px h-4 bg-amber-900/50" />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 game-button game-interactive game-focus-pixel"
                onClick={() => setScale((s) => nextScale(s, -1))}
              >
                <ZoomOut size={14} />
              </Button>
              <span
                className="text-[10px] text-center text-gray-400"
                style={{ width: GRID_UNIT * 5 }}
              >
                {scale}×
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 game-button game-interactive game-focus-pixel"
                onClick={() => setScale((s) => nextScale(s, 1))}
              >
                <ZoomIn size={14} />
              </Button>
              <div className="w-px h-4 bg-amber-900/50" />
              <Button
                variant={showGrid ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8 game-button game-interactive game-focus-pixel"
                onClick={() => setShowGrid((g) => !g)}
                title="Toggle grid"
              >
                <Grid3X3 size={14} />
              </Button>
            </div>
            <div className="flex items-center gap-3" style={{ gap: GRID_UNIT * 2 }}>
              <span className="text-[10px] text-gray-500">
                {phase === AppPhase.ANIMATOR ? 'Animation preview' : 'Base sprite'}
              </span>
              <Layers size={12} className="text-gray-500" />
              <button
                type="button"
                className={`game-button game-interactive game-focus-pixel text-[10px] px-2 py-1 rounded ${
                  crtOverlay ? 'bg-amber-900/50 text-amber-300' : 'text-gray-500 hover:text-gray-400'
                }`}
                onClick={() => setCrtOverlay((v) => !v)}
                title="Toggle CRT overlay"
              >
                CRT
              </button>
            </div>
          </div>

          <div className="game-center flex-1 min-h-0 p-8 relative" style={{ padding: GRID_UNIT * 4 }}>
            {phase === AppPhase.EDITOR ? (
              <PixelEasel
                matrix={matrix}
                scale={scale}
                selectedColorIndex={selectedColorIndex}
                toolMode={toolMode}
                onUpdatePixel={handleUpdatePixel}
                showGrid={showGrid}
              />
            ) : (
              <div
                className="grid grid-cols-2 gap-8 items-start justify-center game-gap-4"
                style={{ gap: GRID_UNIT * 4 }}
              >
                {matrix.matrix?.idle?.length > 0 && (
                  <AnimationPreview
                    frames={matrix.matrix.idle}
                    palette={matrix.palette}
                    label="Idle"
                    fps={matrix.meta.fps.idle}
                    scale={animScale}
                  />
                )}
                {matrix.matrix?.walk?.length > 0 && (
                  <AnimationPreview
                    frames={matrix.matrix.walk}
                    palette={matrix.palette}
                    label="Walk"
                    fps={matrix.meta.fps.walk}
                    scale={animScale}
                  />
                )}
                {matrix.matrix?.jump?.length > 0 && (
                  <AnimationPreview
                    frames={matrix.matrix.jump}
                    palette={matrix.palette}
                    label="Jump"
                    fps={1}
                    scale={animScale}
                  />
                )}
                {matrix.matrix?.special?.length > 0 && (
                  <AnimationPreview
                    frames={matrix.matrix.special}
                    palette={matrix.palette}
                    label="Special"
                    fps={matrix.meta.fps.special}
                    scale={animScale}
                  />
                )}
              </div>
            )}

            {showJson && (
              <div
                className="absolute inset-0 bg-[#0d0d0d]/95 flex items-center justify-center z-30 game-p-2"
                style={{ padding: GRID_UNIT * 4 }}
              >
                <Card className="w-full max-w-2xl flex flex-col bg-[#1a1a1a] border-amber-900/50 max-h-[80vh] overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between py-2 px-4 border-b-2 border-amber-900/50 shrink-0">
                    <CardTitle className="text-sm retro">Matrix JSON</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="game-button game-interactive game-focus-pixel"
                      onClick={() => setShowJson(false)}
                    >
                      Close
                    </Button>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-auto p-4 min-h-0">
                    <pre className="text-[10px] font-mono text-green-500 bg-black/50 p-3 overflow-auto">
                      {JSON.stringify(matrix, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>

        <PalettePanel
          palette={matrix.palette}
          selectedIndex={selectedColorIndex}
          onSelect={(idx) => {
            setSelectedColorIndex(idx);
            if (toolMode === ToolMode.ERASER) setToolMode(ToolMode.PENCIL);
          }}
          onUpdateColor={handleUpdatePaletteColor}
          onAddColor={handleAddColor}
        />
      </div>
      )}
    </div>
  );
};

export default App;

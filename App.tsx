import React, { useCallback, useState } from 'react';
import { Grid3X3, Layers, Maximize, Paintbrush, Film, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { AppPhase, SpriteAnimation, SpriteMatrix, ToolMode } from './types';
import {
  DEFAULT_PREVIEW_SCALE,
  EMPTY_MATRIX_PIXELS,
  GRID_UNIT,
  INITIAL_PALETTE,
  PREVIEW_SCALES,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
} from './constants';
import { getAnimationGrid, generateAnimationFrames } from './services/geminiService';
import { AccountChip, useAccount } from './components/AccountBar';
import Landing from './components/Landing';
import { isMagentaLikeHex, processAnimationSheet } from './services/imageProcessingService';
import { runSpritePipeline } from './services/spritePipeline';
import { downloadSpriteGif } from './lib/gifExport';
import AnimationStudio from './components/AnimationStudio';
import CharacterCreateView from './components/CharacterCreateView';
import CharacterPanel from './components/CharacterPanel';
import PalettePanel from './components/PalettePanel';
import PixelEasel from './components/PixelEasel';
import CanvasViewport from './components/CanvasViewport';
import { MobileEditorDock, MobileEditorSheet } from './components/MobileEditorDock';
import { useIsMobile } from './hooks/useIsMobile';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';

const emptyMatrix = (): SpriteMatrix => ({
  meta: {
    name: 'init',
    width: SPRITE_WIDTH,
    height: SPRITE_HEIGHT,
    created_at: Date.now(),
  },
  palette: [...INITIAL_PALETTE],
  pixels: [...EMPTY_MATRIX_PIXELS],
  animations: [],
});

function nextScale(current: number, delta: number): number {
  let index = PREVIEW_SCALES.indexOf(current as (typeof PREVIEW_SCALES)[number]);
  if (index < 0) index = PREVIEW_SCALES.indexOf(DEFAULT_PREVIEW_SCALE);
  return PREVIEW_SCALES[Math.max(0, Math.min(PREVIEW_SCALES.length - 1, index + delta))];
}

function pixelsToPng(pixels: number[], palette: (string | null)[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create sprite canvas.');
  context.imageSmoothingEnabled = false;
  for (let index = 0; index < pixels.length; index++) {
    const color = palette[pixels[index]];
    if (!color || isMagentaLikeHex(color)) continue;
    context.fillStyle = color;
    context.fillRect(index % SPRITE_WIDTH, Math.floor(index / SPRITE_WIDTH), 1, 1);
  }
  return canvas.toDataURL('image/png');
}

const STEPS = [
  { phase: AppPhase.CREATE, label: '1 · CREATE', short: 'Create', icon: Sparkles },
  { phase: AppPhase.EDITOR, label: '2 · EDIT', short: 'Edit', icon: Paintbrush },
  { phase: AppPhase.ANIMATOR, label: '3 · ANIMATE', short: 'Animate', icon: Film },
];

const MAX_MOBILE_SCALE = 16;

const App: React.FC = () => {
  const account = useAccount();
  const [entered, setEntered] = useState(() => { try { return sessionStorage.getItem('pf_entered') === '1'; } catch { return false; } });
  const goHome = () => { setEntered(false); try { sessionStorage.removeItem('pf_entered'); } catch { /* optional */ } };
  const isMobile = useIsMobile();
  const [fitScale, setFitScale] = useState(6);
  const [mobileZoom, setMobileZoom] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phase, setPhase] = useState<AppPhase>(AppPhase.CREATE);
  const [matrix, setMatrix] = useState<SpriteMatrix>(emptyMatrix);
  const [characterName, setCharacterName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingAnimationId, setGeneratingAnimationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);
  const [scale, setScale] = useState(DEFAULT_PREVIEW_SCALE);
  const [selectedColorIndex, setSelectedColorIndex] = useState(1);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.PENCIL);
  const [showGrid, setShowGrid] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const [crtOverlay, setCrtOverlay] = useState(false);

  const mobileScale = mobileZoom ?? fitScale;
  const zoomBy = useCallback((delta: 1 | -1) => {
    if (!isMobile) {
      setScale((value) => nextScale(value, delta));
      return;
    }
    setMobileZoom((current) => Math.max(2, Math.min(MAX_MOBILE_SCALE, (current ?? fitScale) + delta)));
  }, [fitScale, isMobile]);

  const hasSprite = matrix.meta.name !== 'init' || matrix.pixels.some((pixel) => pixel !== 0);
  const handleGenerateBase = useCallback(async () => {
    const description = prompt.trim() || characterName.trim();
    if (!description) {
      setError('Add a character description before generating.');
      return;
    }
    if (!account.user) {
      setError('Sign in with your AKS account to generate.');
      return;
    }
    if (account.usage && account.usage.remaining <= 0) {
      setError(`Weekly generation limit reached. Resets ${new Date(account.usage.resetsAt).toLocaleString()}.`);
      return;
    }
    if (matrix.animations.length && !window.confirm('Generating a new base sprite will discard the current animation clips. Continue?')) {
      return;
    }
    setIsGenerating(true);
    setError(null);
    setShowJson(false);
    try {
      const { pixels, palette } = await runSpritePipeline(description);
      const name = characterName.trim() || 'New Character';
      setMatrix({
        meta: { name, width: SPRITE_WIDTH, height: SPRITE_HEIGHT, created_at: Date.now() },
        palette,
        pixels,
        animations: [],
      });
      setToolMode(ToolMode.PENCIL);
      setSelectedColorIndex(1);
      setPhase(AppPhase.EDITOR);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate sprite.');
    } finally {
      setIsGenerating(false);
    }
  }, [account.user, account.usage, characterName, matrix.animations.length, prompt]);

  const handleSelectTemplate = useCallback((template: SpriteMatrix) => {
    const copy = {
      ...template,
      meta: { ...template.meta, created_at: Date.now() },
      palette: [...template.palette],
      pixels: [...template.pixels],
      animations: [],
    };
    setMatrix(copy);
    setCharacterName(copy.meta.name);
    setPrompt('');
    setError(null);
    setPhase(AppPhase.EDITOR);
  }, []);

  const handleUpdatePixel = useCallback((index: number, colorIndex: number) => {
    setMatrix((previous) => {
      const pixels = [...previous.pixels];
      pixels[index] = colorIndex;
      return { ...previous, pixels };
    });
  }, []);

  const handleUpdatePaletteColor = useCallback((index: number, color: string) => {
    setMatrix((previous) => {
      const palette = [...previous.palette];
      palette[index] = color;
      return { ...previous, palette };
    });
  }, []);

  const handleAddColor = useCallback(() => {
    setMatrix((previous) => ({ ...previous, palette: [...previous.palette, '#888888'] }));
    setSelectedColorIndex(matrix.palette.length);
  }, [matrix.palette.length]);

  const handleDownloadPng = useCallback(() => {
    const link = document.createElement('a');
    link.download = `${matrix.meta.name.replace(/\s+/g, '_')}_sprite.png`;
    link.href = pixelsToPng(matrix.pixels, matrix.palette);
    link.click();
  }, [matrix]);

  const handleAddAnimation = useCallback((animation: Omit<SpriteAnimation, 'status'>) => {
    const next: SpriteAnimation = { ...animation, status: 'empty' };
    setMatrix((previous) => ({ ...previous, animations: [...previous.animations, next] }));
    setSelectedAnimationId(next.id);
    setError(null);
  }, []);

  const handleUpdateAnimation = useCallback((id: string, updates: Partial<SpriteAnimation>) => {
    setMatrix((previous) => ({
      ...previous,
      animations: previous.animations.map((animation) => animation.id === id ? { ...animation, ...updates } : animation),
    }));
  }, []);

  const handleDeleteAnimation = useCallback((id: string) => {
    setMatrix((previous) => ({ ...previous, animations: previous.animations.filter((animation) => animation.id !== id) }));
    setSelectedAnimationId((current) => current === id ? null : current);
  }, []);

  const handleGenerateAnimation = useCallback(async (id: string) => {
    const animation = matrix.animations.find((item) => item.id === id);
    if (!animation) return;
    if (!account.user) {
      setError('Sign in with your AKS account to generate.');
      return;
    }
    if (account.usage && account.usage.remaining <= 0) {
      setError(`Weekly generation limit reached. Resets ${new Date(account.usage.resetsAt).toLocaleString()}.`);
      return;
    }
    setGeneratingAnimationId(id);
    setError(null);
    handleUpdateAnimation(id, { status: 'generating' });
    try {
      const grid = getAnimationGrid(animation.frameCount);
      const sheet = await generateAnimationFrames(
        pixelsToPng(matrix.pixels, matrix.palette),
        animation.name,
        animation.prompt,
        animation.frameCount,
        grid
      );
      const frames = await processAnimationSheet(
        sheet,
        matrix.palette,
        grid.columns,
        grid.rows,
        animation.frameCount
      );
      handleUpdateAnimation(id, { frames, status: 'ready' });
    } catch (err: unknown) {
      handleUpdateAnimation(id, { status: 'error' });
      setError(err instanceof Error ? err.message : `Could not generate ${animation.name}.`);
    } finally {
      setGeneratingAnimationId(null);
    }
  }, [account.user, account.usage, handleUpdateAnimation, matrix]);

  const handleExportAnimation = useCallback((id: string, exportScale: number) => {
    const animation = matrix.animations.find((item) => item.id === id);
    if (!animation?.frames.length) return;
    const filename = `${matrix.meta.name}-${animation.name}`.replace(/[^a-z0-9_-]+/gi, '_');
    downloadSpriteGif(animation.frames, matrix.palette, animation.fps, animation.loop, exportScale, filename);
  }, [matrix]);

  const handleExportAll = useCallback((exportScale: number) => {
    const ready = matrix.animations.filter((animation) => animation.frames.length > 0);
    for (const animation of ready) {
      handleExportAnimation(animation.id, exportScale);
    }
  }, [handleExportAnimation, matrix.animations]);

  const changePhase = (next: AppPhase) => {
    if (next !== AppPhase.CREATE && !hasSprite) return;
    setError(null);
    setPhase(next);
  };

  if (account.loading) {
    return <div className="flex h-dvh items-center justify-center bg-[#0d0d0d] text-xs text-gray-500 retro">Loading…</div>;
  }
  if (!account.user || !entered) {
    return <Landing user={account.user} onEnter={() => { setEntered(true); try { sessionStorage.setItem('pf_entered', '1'); } catch { /* optional */ } }} />;
  }

  return (
    <div className="game-root game-layout">
      {crtOverlay && <div className="crt-overlay" aria-hidden />}
      <nav className="z-50 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-800 bg-black px-4 max-md:box-content max-md:px-3 max-md:pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={goHome} aria-label="PixelForge home" className="flex items-center gap-2"><img src="/sprite.svg" alt="" width={20} height={20} className="pixelated" /><span className="retro text-xs font-bold tracking-wide text-amber-400 max-[360px]:hidden">PIXELFORGE</span></button>
        <div className="flex items-center gap-2 max-md:hidden" aria-label="Creation steps">
          {STEPS.map((step) => (
            <button
              key={step.phase}
              type="button"
              onClick={() => changePhase(step.phase)}
              disabled={step.phase !== AppPhase.CREATE && !hasSprite}
              aria-current={phase === step.phase ? 'step' : undefined}
              className={`game-button game-interactive rounded px-3 py-2 text-[10px] font-bold transition-colors ${
                phase === step.phase ? 'bg-amber-700 text-white' : 'text-gray-500 hover:text-gray-200 disabled:opacity-30'
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-32 truncate text-[10px] text-gray-500 lg:block">{hasSprite ? matrix.meta.name : 'New character'}</span>
          <AccountChip account={account} />
        </div>
      </nav>

      {phase === AppPhase.CREATE ? (
        <CharacterCreateView
          userName={account.user?.name}
          characterName={characterName}
          onNameChange={setCharacterName}
          description={prompt}
          onDescriptionChange={setPrompt}
          onCreate={handleGenerateBase}
          isGenerating={isGenerating}
          error={error}
          matrix={matrix}
          scale={scale}
          onEditSprite={() => changePhase(AppPhase.EDITOR)}
          onSelectTemplate={handleSelectTemplate}
        />
      ) : phase === AppPhase.EDITOR ? (
        <div className="game-layout-row bg-[#0d0d0d] text-gray-200 scanline-bg max-md:flex-col">
          {!isMobile && <CharacterPanel
            prompt={prompt}
            onPromptChange={setPrompt}
            isGenerating={isGenerating}
            error={error}
            toolMode={toolMode}
            onToolModeChange={setToolMode}
            onGenerate={handleGenerateBase}
            onConfirmAndAnimate={() => changePhase(AppPhase.ANIMATOR)}
            onDownloadPng={handleDownloadPng}
            showJson={showJson}
            onToggleJson={() => setShowJson((value) => !value)}
            onBackToCreate={() => changePhase(AppPhase.CREATE)}
          />}

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-12 shrink-0 items-center justify-between border-b-4 border-amber-900/60 bg-[#141414]/95 px-4 max-md:h-14 max-md:px-2">
              <div className="flex items-center gap-2">
                <span className="mr-2 text-xs text-gray-500 max-md:hidden">{SPRITE_WIDTH}×{SPRITE_HEIGHT}</span>
                <Button variant="ghost" size="icon" className="size-8 game-button game-interactive max-md:size-11" onClick={() => zoomBy(-1)} aria-label="Zoom out">
                  <ZoomOut size={14} />
                </Button>
                <span className="w-10 text-center text-[10px] text-gray-400">{isMobile ? mobileScale : scale}×</span>
                <Button variant="ghost" size="icon" className="size-8 game-button game-interactive max-md:size-11" onClick={() => zoomBy(1)} aria-label="Zoom in">
                  <ZoomIn size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="game-button game-interactive size-11 md:hidden" onClick={() => setMobileZoom(null)} aria-label="Fit to screen" disabled={mobileZoom === null}>
                  <Maximize size={16} />
                </Button>
                <Button variant={showGrid ? 'secondary' : 'ghost'} size="icon" className="size-8 game-button game-interactive max-md:size-11" onClick={() => setShowGrid((value) => !value)} title="Toggle grid" aria-label="Toggle grid">
                  <Grid3X3 size={14} />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500 max-md:hidden">Editing base sprite</span>
                <Layers size={12} className="text-gray-500 max-md:hidden" />
                <button type="button" className={`game-button game-interactive rounded px-2 py-1 text-[10px] max-md:px-3 ${crtOverlay ? 'bg-amber-900/50 text-amber-300' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setCrtOverlay((value) => !value)} aria-pressed={crtOverlay}>
                  CRT
                </button>
              </div>
            </div>
            <div className={`game-center relative flex-1 min-h-0 p-8 ${isMobile ? '!p-0' : ''}`} style={isMobile ? undefined : { padding: GRID_UNIT * 4 }}>
              {isMobile ? (
                <CanvasViewport
                  onFitChange={setFitScale}
                  onPinchStep={zoomBy}
                >
                  <PixelEasel
                    compact
                    matrix={matrix}
                    scale={mobileScale}
                    selectedColorIndex={selectedColorIndex}
                    toolMode={toolMode}
                    onUpdatePixel={handleUpdatePixel}
                    onPickColor={(index) => {
                      setSelectedColorIndex(index);
                      setToolMode(ToolMode.PENCIL);
                    }}
                    showGrid={showGrid}
                  />
                </CanvasViewport>
              ) : (
              <PixelEasel
                matrix={matrix}
                scale={scale}
                selectedColorIndex={selectedColorIndex}
                toolMode={toolMode}
                onUpdatePixel={handleUpdatePixel}
                onPickColor={(index) => {
                  setSelectedColorIndex(index);
                  setToolMode(ToolMode.PENCIL);
                }}
                showGrid={showGrid}
              />
              )}
              {showJson && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d0d0d]/95 p-4 md:p-8">
                  <Card className="flex max-h-[80%] w-full max-w-2xl flex-col overflow-hidden border-amber-900/50 bg-[#1a1a1a]">
                    <CardHeader className="flex flex-row items-center justify-between border-b-2 border-amber-900/50 px-4 py-2">
                      <CardTitle className="retro text-sm">Character JSON</CardTitle>
                      <Button variant="ghost" size="sm" className="game-button game-interactive" onClick={() => setShowJson(false)}>Close</Button>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 overflow-auto p-4">
                      <pre className="overflow-auto bg-black/50 p-3 font-mono text-[10px] text-green-500">{JSON.stringify(matrix, null, 2)}</pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </main>

          {isMobile ? (
            <MobileEditorDock
              toolMode={toolMode}
              onToolModeChange={setToolMode}
              palette={matrix.palette}
              selectedIndex={selectedColorIndex}
              onSelect={(index) => {
                setSelectedColorIndex(index);
                if (toolMode === ToolMode.ERASER) setToolMode(ToolMode.PENCIL);
              }}
              onUpdateColor={handleUpdatePaletteColor}
              onAddColor={handleAddColor}
              onOpenMore={() => setSheetOpen(true)}
            />
          ) : (
          <PalettePanel
            palette={matrix.palette}
            selectedIndex={selectedColorIndex}
            onSelect={(index) => {
              setSelectedColorIndex(index);
              if (toolMode === ToolMode.ERASER) setToolMode(ToolMode.PENCIL);
            }}
            onUpdateColor={handleUpdatePaletteColor}
            onAddColor={handleAddColor}
          />
          )}
          <MobileEditorSheet
            open={isMobile && sheetOpen}
            onClose={() => setSheetOpen(false)}
            prompt={prompt}
            onPromptChange={setPrompt}
            isGenerating={isGenerating}
            error={error}
            onGenerate={handleGenerateBase}
            onConfirmAndAnimate={() => changePhase(AppPhase.ANIMATOR)}
            onDownloadPng={handleDownloadPng}
            showJson={showJson}
            onToggleJson={() => setShowJson((value) => !value)}
            onBackToCreate={() => changePhase(AppPhase.CREATE)}
          />
        </div>
      ) : (
        <AnimationStudio
          animations={matrix.animations}
          palette={matrix.palette}
          selectedId={selectedAnimationId}
          onSelect={setSelectedAnimationId}
          onAdd={handleAddAnimation}
          onUpdate={handleUpdateAnimation}
          onDelete={handleDeleteAnimation}
          onGenerate={handleGenerateAnimation}
          onExport={handleExportAnimation}
          onExportAll={handleExportAll}
          isGenerating={generatingAnimationId !== null}
          error={error}
        />
      )}

      <div
        role="tablist"
        aria-label="Creation steps"
        className="z-50 flex shrink-0 border-t-4 border-amber-900/80 bg-black md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {STEPS.map((step) => {
          const disabled = step.phase !== AppPhase.CREATE && !hasSprite;
          const active = phase === step.phase;
          return (
            <button
              key={step.phase}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'step' : undefined}
              disabled={disabled}
              onClick={() => changePhase(step.phase)}
              className={`game-button game-interactive retro flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${
                active ? 'bg-amber-700 text-white' : 'text-gray-400 disabled:opacity-30'
              }`}
            >
              <step.icon size={18} />
              {step.short.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default App;

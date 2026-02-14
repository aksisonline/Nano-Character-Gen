
import React, { useState, useCallback } from 'react';
import {
  Wand2,
  Download,
  Code,
  Eraser,
  Pencil,
  Pipette,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Layers,
  CheckCircle2,
  PlaySquare,
  ArrowLeft,
  Map as MapIcon,
  User as UserIcon,
} from 'lucide-react';
import { SpriteMatrix, ToolMode, AppPhase, EngineMode } from './types';
import { INITIAL_PALETTE, EMPTY_MATRIX_PIXELS, SPRITE_WIDTH, SPRITE_HEIGHT } from './constants';
import { BASE_CHARACTERS } from './baseCharacters';
import { generateSpriteImage, generateAnimationSheet } from './services/geminiService';
import { processImageToMatrix, processSpriteSheet } from './services/imageProcessingService';
import SpriteCanvas from './components/SpriteCanvas';
import PaletteEditor from './components/PaletteEditor';
import AnimationPreview from './components/AnimationPreview';
import WorldEngine from './components/WorldEngine';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Textarea } from '@/components/ui/8bit/textarea';
import { Label } from '@/components/ui/8bit/label';

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

const App: React.FC = () => {
  const [engineMode, setEngineMode] = useState<EngineMode>(EngineMode.CHARACTER);
  const [prompt, setPrompt] = useState('Cyberpunk Samurai');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AppPhase>(AppPhase.EDITOR);

  const [matrix, setMatrix] = useState<SpriteMatrix>(emptyMatrix());

  const [zoom, setZoom] = useState(12);
  const [selectedColorIndex, setSelectedColorIndex] = useState(1);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.PENCIL);
  const [showGrid, setShowGrid] = useState(true);
  const [showJson, setShowJson] = useState(false);

  const loadBaseCharacter = useCallback((base: { matrix: SpriteMatrix }) => {
    setMatrix({ ...base.matrix, meta: { ...base.matrix.meta, created_at: Date.now() } });
    setPhase(AppPhase.EDITOR);
    setError(null);
    setShowJson(false);
  }, []);

  const handleGenerateBase = async () => {
    if (!process.env.API_KEY) {
      setError('Missing API Key in environment variables.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    setShowJson(false);
    setPhase(AppPhase.EDITOR);
    try {
      const base64Img = await generateSpriteImage(prompt);
      const newMatrix = await processImageToMatrix(base64Img, [null]);
      setMatrix(newMatrix);
      setToolMode(ToolMode.PENCIL);
      setSelectedColorIndex(1);
    } catch (err: any) {
      setError(err.message || 'Failed to generate sprite');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmAndAnimate = async () => {
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
      for (let i = 0; i < matrix.pixels.length; i++) {
        const color = matrix.palette[matrix.pixels[i]];
        if (color) {
          ctx.fillStyle = color;
          const x = i % SPRITE_WIDTH;
          const y = Math.floor(i / SPRITE_WIDTH);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      const currentSpriteBase64 = canvas.toDataURL('image/png');
      const sheetBase64 = await generateAnimationSheet(currentSpriteBase64, prompt);
      const anims = await processSpriteSheet(sheetBase64, matrix.palette, matrix.pixels);
      setMatrix((prev) => ({ ...prev, matrix: anims }));
      setPhase(AppPhase.ANIMATOR);
    } catch (err: any) {
      setError(err.message || 'Failed to generate animations');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdatePixel = useCallback((index: number, colorIndex: number) => {
    setMatrix((prev) => {
      const newPixels = [...prev.pixels];
      newPixels[index] = colorIndex;
      return { ...prev, pixels: newPixels };
    });
  }, []);

  const handleUpdatePaletteColor = (index: number, newHex: string) => {
    setMatrix((prev) => {
      const newPalette = [...prev.palette];
      newPalette[index] = newHex;
      return { ...prev, palette: newPalette };
    });
  };

  const handleAddColor = () => {
    setMatrix((prev) => ({
      ...prev,
      palette: [...prev.palette, '#888888'],
    }));
    setSelectedColorIndex(matrix.palette.length);
  };

  const downloadPNG = () => {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_WIDTH;
    canvas.height = SPRITE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (let i = 0; i < matrix.pixels.length; i++) {
      const color = matrix.palette[matrix.pixels[i]];
      if (color) {
        ctx.fillStyle = color;
        const x = i % SPRITE_WIDTH;
        const y = Math.floor(i / SPRITE_WIDTH);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const link = document.createElement('a');
    link.download = `${prompt.replace(/\s+/g, '_')}_base.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  if (engineMode === EngineMode.WORLD) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <nav className="h-10 bg-black flex items-center justify-center border-b border-gray-800 shrink-0 z-50">
          <div className="flex bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setEngineMode(EngineMode.CHARACTER)}
              className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${engineMode === EngineMode.CHARACTER ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <UserIcon size={12} /> CHARACTER
            </button>
            <button
              onClick={() => setEngineMode(EngineMode.WORLD)}
              className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${engineMode === EngineMode.WORLD ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <MapIcon size={12} /> WORLD
            </button>
          </div>
        </nav>
        <WorldEngine />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <nav className="h-10 bg-black flex items-center justify-center border-b border-gray-800 shrink-0 z-50">
        <div className="flex bg-gray-900 rounded-lg p-1">
          <button
            onClick={() => setEngineMode(EngineMode.CHARACTER)}
            className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${engineMode === EngineMode.CHARACTER ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <UserIcon size={12} /> CHARACTER
          </button>
          <button
            onClick={() => setEngineMode(EngineMode.WORLD)}
            className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${engineMode === EngineMode.WORLD ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <MapIcon size={12} /> WORLD
          </button>
        </div>
      </nav>
      <div className="flex flex-1 w-full min-h-0 bg-[#0d0d0d] text-gray-200">
      <aside className="w-80 shrink-0 border-r-4 border-amber-900/80 bg-[#141414] p-4 flex flex-col gap-4 overflow-y-auto">
        <header className="border-b-4 border-amber-900/80 pb-3">
          <h1 className="text-lg font-bold text-amber-400 retro tracking-wide">PIXELFORGE</h1>
          <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest">8-Bit Character Gen</p>
        </header>

        <Card className="bg-[#1a1a1a] border-amber-900/60">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <UserIcon size={12} /> Base characters
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 flex gap-2">
            {BASE_CHARACTERS.map((base) => (
              <Button
                key={base.id}
                variant="outline"
                size="sm"
                className="flex-1 retro text-[10px] py-1"
                onClick={() => loadBaseCharacter(base)}
              >
                {base.name}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-amber-900/60">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs">Phase 1: Base sprite</CardTitle>
            <span className="text-[10px] text-gray-500">32×48 px</span>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <Label className="text-[10px] text-gray-400">Describe your character</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={phase === AppPhase.ANIMATOR}
              placeholder="e.g. A robotic wizard with a glowing staff..."
              className="min-h-20 resize-none bg-[#0d0d0d] border-2 border-amber-900/60 text-xs retro"
              font="retro"
            />
            {phase === AppPhase.EDITOR ? (
              <Button
                onClick={handleGenerateBase}
                disabled={isGenerating}
                className="w-full retro"
              >
                {isGenerating ? <RefreshCw className="animate-spin size-3" /> : <Wand2 size={14} />}
                {isGenerating ? 'Forging…' : 'Generate base'}
              </Button>
            ) : (
              <Button variant="outline" className="w-full retro" onClick={() => setPhase(AppPhase.EDITOR)}>
                <ArrowLeft size={14} /> Back to editor
              </Button>
            )}
            {error && (
              <div className="text-[10px] text-red-400 bg-red-950/50 border border-red-900/50 px-2 py-1.5 rounded-none">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {phase === AppPhase.EDITOR && (
          <Card className="bg-[#1a1a1a] border-amber-900/60">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">Easel</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex gap-1">
                {[
                  { mode: ToolMode.PENCIL, icon: Pencil, label: 'Draw' },
                  { mode: ToolMode.ERASER, icon: Eraser, label: 'Erase' },
                  { mode: ToolMode.PICKER, icon: Pipette, label: 'Pick' },
                ].map((tool) => (
                  <Button
                    key={tool.mode}
                    variant={toolMode === tool.mode ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 retro text-[10px]"
                    onClick={() => setToolMode(tool.mode)}
                  >
                    <tool.icon size={12} /> {tool.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#1a1a1a] border-green-900/50">
          <CardContent className="p-3">
            <Button
              onClick={handleConfirmAndAnimate}
              disabled={isGenerating}
              variant="secondary"
              className="w-full retro text-xs border-2 border-green-800/50"
            >
              {isGenerating ? <RefreshCw className="animate-spin size-3" /> : <CheckCircle2 size={14} />}
              {isGenerating ? 'Animating…' : 'Confirm & animate'}
            </Button>
            <p className="text-[10px] text-gray-500 mt-1.5 text-center">
              Idle, Walk, Jump, Special
            </p>
          </CardContent>
        </Card>

        <div className="mt-auto border-t-4 border-amber-900/80 pt-3 space-y-2">
          <Button variant="outline" size="sm" className="w-full retro text-[10px]" onClick={downloadPNG}>
            <Download size={12} /> Download PNG
          </Button>
          <Button variant="outline" size="sm" className="w-full retro text-[10px]" onClick={() => setShowJson(!showJson)}>
            <Code size={12} /> {showJson ? 'Hide' : 'View'} matrix JSON
          </Button>
        </div>
      </aside>

      {/* Main: Canvas area (Krunker-style dark workspace) */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiMxYTE4MTgiLz48L3N2Zz4=')]">
        <div className="h-12 border-b-4 border-amber-900/60 bg-[#141414]/95 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-mono">{SPRITE_WIDTH}×{SPRITE_HEIGHT}</span>
            <div className="h-4 w-px bg-amber-900/50" />
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => Math.max(4, z - 2))}>
              <ZoomOut size={14} />
            </Button>
            <span className="text-[10px] w-10 text-center text-gray-400">{Math.round((zoom * 100) / 16)}%</span>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => Math.min(32, z + 2))}>
              <ZoomIn size={14} />
            </Button>
            <div className="h-4 w-px bg-amber-900/50" />
            <Button
              variant={showGrid ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8"
              onClick={() => setShowGrid(!showGrid)}
              title="Toggle grid"
            >
              <Grid3X3 size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <Layers size={12} />
            {phase === AppPhase.ANIMATOR ? 'Animation preview' : 'Base sprite'}
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center p-8 relative">
          {phase === AppPhase.EDITOR ? (
            <div className="relative">
              <SpriteCanvas
                matrix={matrix}
                zoom={zoom}
                selectedColorIndex={selectedColorIndex}
                toolMode={toolMode}
                onUpdatePixel={handleUpdatePixel}
                showGrid={showGrid}
              />
              <div className="absolute -right-14 top-0 bg-[#1a1a1a] border-2 border-amber-900/50 p-1.5">
                <div className="text-[8px] text-gray-500 mb-0.5 text-center">1×</div>
                <SpriteCanvas
                  matrix={matrix}
                  zoom={1}
                  selectedColorIndex={0}
                  toolMode={ToolMode.PENCIL}
                  onUpdatePixel={() => {}}
                  showGrid={false}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 items-start justify-center">
              {matrix.matrix?.idle?.length > 0 && (
                <AnimationPreview
                  frames={matrix.matrix.idle}
                  palette={matrix.palette}
                  label="Idle"
                  fps={matrix.meta.fps.idle}
                  scale={zoom > 6 ? 6 : zoom}
                />
              )}
              {matrix.matrix?.walk?.length > 0 && (
                <AnimationPreview
                  frames={matrix.matrix.walk}
                  palette={matrix.palette}
                  label="Walk"
                  fps={matrix.meta.fps.walk}
                  scale={zoom > 6 ? 6 : zoom}
                />
              )}
              {matrix.matrix?.jump?.length > 0 && (
                <AnimationPreview
                  frames={matrix.matrix.jump}
                  palette={matrix.palette}
                  label="Jump"
                  fps={1}
                  scale={zoom > 6 ? 6 : zoom}
                />
              )}
              {matrix.matrix?.special?.length > 0 && (
                <AnimationPreview
                  frames={matrix.matrix.special}
                  palette={matrix.palette}
                  label="Special"
                  fps={matrix.meta.fps.special}
                  scale={zoom > 6 ? 6 : zoom}
                />
              )}
            </div>
          )}

          {showJson && (
            <div className="absolute inset-0 bg-[#0d0d0d]/95 flex items-center justify-center p-8 z-30">
              <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-[#1a1a1a] border-amber-900/50">
                <CardHeader className="flex flex-row items-center justify-between py-2 px-4 border-b-2 border-amber-900/50">
                  <CardTitle className="text-sm">Matrix JSON</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowJson(false)}>
                    Close
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto p-4">
                  <pre className="text-[10px] font-mono text-green-500 bg-black/50 p-3 overflow-auto">
                    {JSON.stringify(matrix, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Right: Palette (8-bit panel) */}
      <aside className="w-56 shrink-0 border-l-4 border-amber-900/80 bg-[#141414] flex flex-col">
        <PaletteEditor
          palette={matrix.palette}
          selectedIndex={selectedColorIndex}
          onSelect={(idx) => {
            setSelectedColorIndex(idx);
            if (toolMode === ToolMode.ERASER) setToolMode(ToolMode.PENCIL);
          }}
          onUpdateColor={handleUpdatePaletteColor}
          onAddColor={handleAddColor}
        />
      </aside>
      </div>
    </div>
  );
};

export default App;

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
  ArrowLeft
} from 'lucide-react';
import { SpriteMatrix, ToolMode, AppPhase } from './types';
import { INITIAL_PALETTE, EMPTY_MATRIX_PIXELS, SPRITE_WIDTH, SPRITE_HEIGHT } from './constants';
import { generateSpriteImage, generateAnimationSheet } from './services/geminiService';
import { processImageToMatrix, processSpriteSheet } from './services/imageProcessingService';
import SpriteCanvas from './components/SpriteCanvas';
import PaletteEditor from './components/PaletteEditor';
import AnimationPreview from './components/AnimationPreview';

const App: React.FC = () => {
  // State
  const [prompt, setPrompt] = useState('Cyberpunk Samurai');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AppPhase>(AppPhase.EDITOR);
  
  const [matrix, setMatrix] = useState<SpriteMatrix>({
    meta: { 
        name: 'init', 
        width: SPRITE_WIDTH, 
        height: SPRITE_HEIGHT, 
        created_at: Date.now(),
        fps: { idle: 0.5, walk: 4, special: 8 }
    },
    palette: [...INITIAL_PALETTE],
    pixels: [...EMPTY_MATRIX_PIXELS],
    matrix: { idle: [], walk: [], jump: [], special: [] }
  });

  const [zoom, setZoom] = useState(12);
  const [selectedColorIndex, setSelectedColorIndex] = useState(1); // Default to black
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.PENCIL);
  const [showGrid, setShowGrid] = useState(true);
  const [showJson, setShowJson] = useState(false);

  // Actions
  const handleGenerateBase = async () => {
    if (!process.env.API_KEY) {
      setError("Missing API Key in environment variables.");
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setShowJson(false);
    setPhase(AppPhase.EDITOR);

    try {
      const base64Img = await generateSpriteImage(prompt);
      // Pass empty palette to start fresh, or keep? Usually fresh for new gen.
      const newMatrix = await processImageToMatrix(base64Img, [null]); 
      
      setMatrix(newMatrix);
      setToolMode(ToolMode.PENCIL);
      setSelectedColorIndex(1); 
    } catch (err: any) {
      setError(err.message || "Failed to generate sprite");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmAndAnimate = async () => {
      if (!process.env.API_KEY) {
        setError("Missing API Key.");
        return;
      }

      setIsGenerating(true);
      setError(null);

      try {
          // 1. Convert current matrix to Base64 Image
          const canvas = document.createElement('canvas');
          canvas.width = SPRITE_WIDTH;
          canvas.height = SPRITE_HEIGHT;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas init failed");

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

          // 2. Generate Sheet via Gemini
          const sheetBase64 = await generateAnimationSheet(currentSpriteBase64, prompt);

          // 3. Process Sheet using EXISTING palette AND existing base pixels for Idle generation
          const anims = await processSpriteSheet(sheetBase64, matrix.palette, matrix.pixels);

          // 4. Update State
          setMatrix(prev => ({
              ...prev,
              matrix: anims
          }));
          setPhase(AppPhase.ANIMATOR);

      } catch (err: any) {
          setError(err.message || "Failed to generate animations");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleUpdatePixel = useCallback((index: number, colorIndex: number) => {
    setMatrix(prev => {
      const newPixels = [...prev.pixels];
      newPixels[index] = colorIndex;
      return { ...prev, pixels: newPixels };
    });
  }, []);

  const handleUpdatePaletteColor = (index: number, newHex: string) => {
    setMatrix(prev => {
      const newPalette = [...prev.palette];
      newPalette[index] = newHex;
      return { ...prev, palette: newPalette };
    });
  };

  const handleAddColor = () => {
    setMatrix(prev => {
      const newPalette = [...prev.palette, '#888888'];
      return { ...prev, palette: newPalette };
    });
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

  return (
    <div className="flex h-screen w-full bg-gray-950 text-gray-200 font-sans">
      {/* Sidebar: Controls */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800 bg-gray-900 p-6 flex flex-col gap-6 overflow-y-auto z-20 shadow-xl">
        <header>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 tracking-tight">
            PixelForge
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-semibold">AI 8-Bit Engine</p>
        </header>

        {/* Generation Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-400 uppercase">Phase 1: Base Sprite</label>
            <span className="text-[10px] bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded-full">32x48</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={phase === AppPhase.ANIMATOR}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none h-24 placeholder-gray-600 disabled:opacity-50"
            placeholder="e.g. A robotic wizard with a glowing staff..."
          />
          
          {phase === AppPhase.EDITOR ? (
              <button
                onClick={handleGenerateBase}
                disabled={isGenerating}
                className={`
                  w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all
                  ${isGenerating 
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/25 active:scale-95'}
                `}
              >
                {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <Wand2 size={16} />}
                {isGenerating ? 'Forging Matrix...' : 'Generate Base'}
              </button>
          ) : (
             <button
                onClick={() => setPhase(AppPhase.EDITOR)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all"
             >
                <ArrowLeft size={16} /> Back to Editor
             </button>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="h-px bg-gray-800" />

        {/* Phase Action or Tools */}
        {phase === AppPhase.EDITOR ? (
            <>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-400 uppercase">The Easel</label>
                  <div className="flex gap-2">
                    {[
                      { mode: ToolMode.PENCIL, icon: Pencil, label: 'Draw' },
                      { mode: ToolMode.ERASER, icon: Eraser, label: 'Erase' },
                      { mode: ToolMode.PICKER, icon: Pipette, label: 'Pick' },
                    ].map((tool) => (
                      <button
                        key={tool.mode}
                        onClick={() => setToolMode(tool.mode)}
                        className={`
                          flex-1 flex flex-col items-center gap-1 p-2 rounded border transition-all
                          ${toolMode === tool.mode 
                            ? 'bg-gray-800 border-indigo-500 text-indigo-400' 
                            : 'bg-transparent border-gray-700 text-gray-500 hover:bg-gray-800 hover:text-gray-300'}
                        `}
                      >
                        <tool.icon size={18} />
                        <span className="text-[10px] font-medium">{tool.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                    <button
                        onClick={handleConfirmAndAnimate}
                        disabled={isGenerating}
                        className={`
                        w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all border border-green-600/30
                        ${isGenerating 
                            ? 'bg-gray-800 text-gray-500' 
                            : 'bg-gradient-to-r from-green-900 to-green-800 hover:from-green-800 hover:to-green-700 text-green-100 shadow-lg'}
                        `}
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        {isGenerating ? 'Animating...' : 'Confirm & Animate'}
                    </button>
                    <p className="text-[10px] text-gray-500 mt-2 text-center leading-relaxed">
                        Locks the current design and generates Idle, Walk, Jump, and Special animations.
                    </p>
                </div>
            </>
        ) : (
             <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-indigo-400 mb-2">
                    <PlaySquare size={16} />
                    <span className="font-bold text-sm">Animator Mode</span>
                </div>
                <p className="text-xs text-gray-400">
                    Showing generated loops. Edit the palette below to update all frames instantly.
                </p>
             </div>
        )}

        <div className="h-px bg-gray-800 mt-auto" />

        {/* Export Section */}
        <div className="space-y-3">
           <button
            onClick={downloadPNG}
            className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 hover:bg-gray-800 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <Download size={16} /> Download Base PNG
          </button>
          <button
            onClick={() => setShowJson(!showJson)}
            className="w-full flex items-center justify-center gap-2 py-2 border border-gray-700 hover:bg-gray-800 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <Code size={16} /> {showJson ? 'Hide Matrix' : 'View Matrix JSON'}
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')]">
        
        {/* Toolbar */}
        <div className="h-14 border-b border-gray-800 bg-gray-900/90 backdrop-blur flex items-center justify-between px-6">
           <div className="flex items-center gap-4">
              <span className="text-sm font-mono text-gray-400">
                {SPRITE_WIDTH}x{SPRITE_HEIGHT} px
              </span>
              <div className="h-4 w-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(4, z - 2))} className="p-1 hover:text-white text-gray-500"><ZoomOut size={16}/></button>
                <span className="text-xs w-12 text-center text-gray-400">{zoom * 100 / 16}%</span>
                <button onClick={() => setZoom(z => Math.min(32, z + 2))} className="p-1 hover:text-white text-gray-500"><ZoomIn size={16}/></button>
              </div>
              <div className="h-4 w-px bg-gray-700" />
              <button 
                onClick={() => setShowGrid(!showGrid)} 
                className={`p-1 transition-colors ${showGrid ? 'text-indigo-400' : 'text-gray-500 hover:text-white'}`}
                title="Toggle Grid"
              >
                <Grid3X3 size={16} />
              </button>
           </div>
           
           <div className="flex items-center gap-3 text-xs text-gray-500">
             <div className="flex items-center gap-1">
                <Layers size={14} />
                <span>Layer: {phase === AppPhase.ANIMATOR ? 'Animation Preview' : 'Base Sprite'}</span>
             </div>
             {phase === AppPhase.EDITOR && (
                 <>
                    <span className="text-gray-700">|</span>
                    <span>Hold click to paint</span>
                 </>
             )}
           </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-10 relative">
           
           {phase === AppPhase.EDITOR ? (
                <div className="relative shadow-2xl">
                    <SpriteCanvas
                        matrix={matrix}
                        zoom={zoom}
                        selectedColorIndex={selectedColorIndex}
                        toolMode={toolMode}
                        onUpdatePixel={handleUpdatePixel}
                        showGrid={showGrid}
                    />
                    {/* Actual size preview floating */}
                    <div className="absolute -right-16 top-0 bg-gray-800 p-2 rounded border border-gray-600 shadow-lg">
                        <div className="text-[10px] text-gray-400 mb-1 text-center">1x</div>
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
               <div className="grid grid-cols-2 gap-8 items-start justify-center animate-in fade-in duration-500">
                   {matrix.matrix?.idle && matrix.matrix.idle.length > 0 && (
                       <AnimationPreview 
                            frames={matrix.matrix.idle} 
                            palette={matrix.palette} 
                            label="Idle" 
                            fps={matrix.meta.fps.idle}
                            scale={zoom > 6 ? 6 : zoom}
                       />
                   )}
                   {matrix.matrix?.walk && matrix.matrix.walk.length > 0 && (
                       <AnimationPreview 
                            frames={matrix.matrix.walk} 
                            palette={matrix.palette} 
                            label="Walk" 
                            fps={matrix.meta.fps.walk}
                            scale={zoom > 6 ? 6 : zoom}
                       />
                   )}
                   {matrix.matrix?.jump && matrix.matrix.jump.length > 0 && (
                       <AnimationPreview 
                            frames={matrix.matrix.jump} 
                            palette={matrix.palette} 
                            label="Jump" 
                            fps={1} // Jump is usually static or 1 frame
                            scale={zoom > 6 ? 6 : zoom}
                       />
                   )}
                   {matrix.matrix?.special && matrix.matrix.special.length > 0 && (
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
           
           {/* JSON Modal Overlay */}
           {showJson && (
             <div className="absolute inset-0 bg-gray-950/90 backdrop-blur-sm z-30 p-10 flex items-center justify-center">
               <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col h-3/4 shadow-2xl">
                 <div className="flex items-center justify-between p-4 border-b border-gray-800">
                   <h3 className="font-bold text-gray-200">Matrix JSON Data</h3>
                   <button onClick={() => setShowJson(false)} className="text-gray-500 hover:text-white">Close</button>
                 </div>
                 <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-green-400 bg-black/50">
                   {JSON.stringify(matrix, null, 2)}
                 </pre>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* Right Sidebar: Palette */}
      <div className="w-64 flex-shrink-0 border-l border-gray-800 bg-gray-900 z-20 shadow-xl flex flex-col">
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
      </div>

    </div>
  );
};

export default App;
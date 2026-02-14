import React, { useState, useRef, useEffect } from 'react';
import { WorldTile } from '../types';
import { generateTileset } from '../services/geminiService';
import { processTileset, isMagentaLikeHex } from '../services/imageProcessingService';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, GRID_UNIT } from '../constants';
import { Wand2, RefreshCw, LayoutGrid, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Button } from '@/components/ui/8bit/button';
import { Textarea } from '@/components/ui/8bit/textarea';
import { Label } from '@/components/ui/8bit/label';

interface WorldEngineProps {}

const WorldEngine: React.FC<WorldEngineProps> = () => {
    // ---------------- STATE ----------------
    const [tileset, setTileset] = useState<WorldTile[]>([]);
    const [mapData, setMapData] = useState<number[]>(new Array(WORLD_WIDTH * WORLD_HEIGHT).fill(-1));
    const [selectedTileIndex, setSelectedTileIndex] = useState<number>(-1);
    
    // UI State
    const [prompt, setPrompt] = useState("Dungeon with stone floors and lava rivers");
    const [isGenerating, setIsGenerating] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [tool, setTool] = useState<'PAINT' | 'FILL'>('PAINT');
    
    // Viewport State (Camera)
    const [camera, setCamera] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tileCache = useRef<Map<number, HTMLCanvasElement>>(new Map());

    useEffect(() => {
        tileCache.current.clear();
    }, [tileset]);

    // ---------------- GENERATION ----------------
    const handleGenerateTileset = async () => {
        setIsGenerating(true);
        try {
            const base64 = await generateTileset(prompt);
            const newTiles = await processTileset(base64);
            setTileset(newTiles);
            setSelectedTileIndex(0);
            
            // Auto-fill map with first tile if empty
            if (mapData[0] === -1 && newTiles.length > 0) {
                 setMapData(new Array(WORLD_WIDTH * WORLD_HEIGHT).fill(0));
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate tileset.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateLayout = () => {
        if (tileset.length === 0) return;
        const n = tileset.length;
        const newMap = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT);
        const fill = (x: number, y: number, tileIdx: number) => {
            if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT)
                newMap[y * WORLD_WIDTH + x] = tileIdx;
        };
        // Tile roles: 0 = main floor, 1 = wall, 2 = liquid/secondary, 3+ = decor
        const floorIdx = 0;
        const wallIdx = n > 1 ? 1 : 0;
        const liquidIdx = n > 2 ? 2 : floorIdx;
        const decorStart = Math.min(3, n);
        const decorEnd = n;

        // 1. Border walls
        for (let x = 0; x < WORLD_WIDTH; x++) {
            fill(x, 0, wallIdx);
            fill(x, WORLD_HEIGHT - 1, wallIdx);
        }
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            fill(0, y, wallIdx);
            fill(WORLD_WIDTH - 1, y, wallIdx);
        }

        // 2. Interior: main floor with cellular automata for inner walls
        for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
            for (let x = 1; x < WORLD_WIDTH - 1; x++) {
                newMap[y * WORLD_WIDTH + x] = Math.random() < 0.42 ? wallIdx : floorIdx;
            }
        }
        for (let step = 0; step < 4; step++) {
            const temp = new Int32Array(newMap);
            for (let y = 2; y < WORLD_HEIGHT - 2; y++) {
                for (let x = 2; x < WORLD_WIDTH - 2; x++) {
                    let walls = 0;
                    for (let dy = -1; dy <= 1; dy++)
                        for (let dx = -1; dx <= 1; dx++)
                            if (temp[(y + dy) * WORLD_WIDTH + (x + dx)] === wallIdx) walls++;
                    const idx = y * WORLD_WIDTH + x;
                    if (walls > 4) newMap[idx] = wallIdx;
                    else if (walls < 4) newMap[idx] = floorIdx;
                }
            }
        }

        // 3. Lava/river strip (use tile 2) – a few horizontal or vertical bands
        if (liquidIdx !== floorIdx) {
            const midY = Math.floor(WORLD_HEIGHT / 2);
            for (let x = 2; x < WORLD_WIDTH - 2; x++) {
                if (Math.random() < 0.85) fill(x, midY, liquidIdx);
                if (Math.random() < 0.4) fill(x, midY + 1, liquidIdx);
            }
            const midX = Math.floor(WORLD_WIDTH / 2);
            for (let y = 4; y < WORLD_HEIGHT - 4; y++) {
                if (Math.random() < 0.7) fill(midX, y, liquidIdx);
            }
        }

        // 4. Scatter decor (tiles 3, 4, 5, …) on floor only
        for (let y = 2; y < WORLD_HEIGHT - 2; y++) {
            for (let x = 2; x < WORLD_WIDTH - 2; x++) {
                const idx = y * WORLD_WIDTH + x;
                if (newMap[idx] !== floorIdx) continue;
                if (Math.random() > 0.96) {
                    const decorIdx = decorStart + Math.floor(Math.random() * (decorEnd - decorStart));
                    if (decorIdx < n) newMap[idx] = decorIdx;
                }
            }
        }

        setMapData(Array.from(newMap));
    };

    // ---------------- RENDERING ----------------
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || tileset.length === 0) return;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no alpha on main canvas
        if (!ctx) return;

        // Ensure canvas size matches container
        if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
        }

        ctx.fillStyle = '#0f1016'; // Background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Calculate visible range
        const viewW = canvas.width;
        const viewH = canvas.height;
        
        const startX = Math.floor(camera.x / (TILE_SIZE * zoom));
        const startY = Math.floor(camera.y / (TILE_SIZE * zoom));
        const endX = startX + Math.ceil(viewW / (TILE_SIZE * zoom)) + 1;
        const endY = startY + Math.ceil(viewH / (TILE_SIZE * zoom)) + 1;
        
        // Clamp
        const minX = Math.max(0, startX);
        const minY = Math.max(0, startY);
        const maxX = Math.min(WORLD_WIDTH, endX);
        const maxY = Math.min(WORLD_HEIGHT, endY);
        
        // Offscreen canvas for tile rendering cache could be added here, 
        // but for now we draw pixels directly or cache tile images.
        // Let's cache tile images as HTMLImageElements or Canvases
        
        // Draw Visible Tiles
        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const mapIdx = y * WORLD_WIDTH + x;
                const tileIdx = mapData[mapIdx];
                
                if (tileIdx !== -1 && tileset[tileIdx]) {
                    const tile = tileset[tileIdx];
                    const screenX = Math.floor((x * TILE_SIZE * zoom) - camera.x);
                    const screenY = Math.floor((y * TILE_SIZE * zoom) - camera.y);
                    
                    // Simple color fill for performance if zoomed out far? No, pixel art needs precision.
                    // To optimize: We should create an ImageBitmap for each tile once.
                    // Doing inline pixel drawing for 200 tiles is slow.
                    // For this prototype, let's just do a solid color approximation if zoomed out, 
                    // or implement a quick tile cache.
                    
                   renderTileToCtx(ctx, tile, screenX, screenY, zoom);
                }
            }
        }
        
    }, [mapData, tileset, camera, zoom]);

    const renderTileToCtx = (ctx: CanvasRenderingContext2D, tile: WorldTile, x: number, y: number, scale: number) => {
        // Check cache
        const tileId = tileset.indexOf(tile);
        let cached = tileCache.current.get(tileId);
        
        if (!cached) {
            cached = document.createElement('canvas');
            cached.width = TILE_SIZE;
            cached.height = TILE_SIZE;
            const cCtx = cached.getContext('2d');
            if (cCtx) {
                for (let i = 0; i < tile.pixels.length; i++) {
                    const color = tile.palette[tile.pixels[i]];
                    if (color && !isMagentaLikeHex(color)) {
                        cCtx.fillStyle = color;
                        cCtx.fillRect(i % TILE_SIZE, Math.floor(i / TILE_SIZE), 1, 1);
                    }
                }
            }
            tileCache.current.set(tileId, cached);
        }
        
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cached, x, y, TILE_SIZE * scale, TILE_SIZE * scale);
        
        // Draw Wall Indicator overlay
        if (tile.isWall) {
             ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
             ctx.lineWidth = 2;
             ctx.strokeRect(x, y, TILE_SIZE * scale, TILE_SIZE * scale);
        }
    };

    // ---------------- INPUT HANDLERS ----------------
    
    const getMapCoords = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = Math.floor((screenX + camera.x) / (TILE_SIZE * zoom));
        const worldY = Math.floor((screenY + camera.y) / (TILE_SIZE * zoom));
        return { x: worldX, y: worldY };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Pan
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            return;
        }
        
        if (e.button === 0 && selectedTileIndex !== -1) {
            handlePaint(e);
        }
    };
    
    const handlePaint = (e: React.MouseEvent) => {
        const { x, y } = getMapCoords(e);
        if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
        
        if (tool === 'PAINT') {
            const idx = y * WORLD_WIDTH + x;
            if (mapData[idx] !== selectedTileIndex) {
                const newData = [...mapData];
                newData[idx] = selectedTileIndex;
                setMapData(newData);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setCamera(prev => ({
                x: prev.x - dx,
                y: prev.y - dy
            }));
            setDragStart({ x: e.clientX, y: e.clientY });
        } else if (e.buttons === 1 && !e.shiftKey) {
            handlePaint(e);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const toggleWall = (tileIndex: number) => {
        const newTiles = [...tileset];
        newTiles[tileIndex].isWall = !newTiles[tileIndex].isWall;
        setTileset(newTiles);
        // Clear cache for this tile to redraw overlay
        tileCache.current.delete(tileIndex);
    };

    return (
        <div className="flex h-full w-full bg-[#0d0d0d] text-gray-200 retro">
            {/* Sidebar – 8bitcn */}
            <aside
                className="shrink-0 flex flex-col border-r-4 border-amber-900/80 bg-[#141414] z-20 overflow-hidden pixelated"
                style={{ width: GRID_UNIT * 32, padding: GRID_UNIT * 2, gap: GRID_UNIT * 2 }}
            >
                <Card className="bg-[#1a1a1a] border-2 border-amber-900/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase tracking-wider text-amber-200/90">Step 1: Theme</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Label className="text-[10px] uppercase text-gray-400">Describe your world</Label>
                        <Textarea
                            placeholder="e.g. Dungeon with stone floors and lava rivers..."
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            className="min-h-[72px] text-xs resize-none"
                        />
                        <Button
                            onClick={handleGenerateTileset}
                            disabled={isGenerating}
                            className="w-full game-button game-interactive game-focus-pixel"
                        >
                            {isGenerating ? <RefreshCw className="animate-spin" size={12} /> : <Wand2 size={12} />}
                            {' '}GENERATE TILESET
                        </Button>
                    </CardContent>
                </Card>

                <div className="flex-1 min-h-0 flex flex-col border-2 border-amber-900/50 rounded bg-black/40 p-2">
                    <Label className="text-[10px] uppercase text-gray-400 mb-1">Tiles</Label>
                    <div className="grid grid-cols-4 gap-1 overflow-y-auto min-h-0">
                        {tileset.map((tile, i) => (
                            <button
                                key={tile.id}
                                type="button"
                                onClick={() => setSelectedTileIndex(i)}
                                className={`relative aspect-square cursor-pointer border-2 game-interactive game-focus-pixel overflow-hidden ${selectedTileIndex === i ? 'border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.5)]' : 'border-transparent hover:border-gray-500'}`}
                            >
                                <TilePreview tile={tile} />
                                {tile.isWall && (
                                    <span className="absolute bottom-0 right-0 px-1 py-0.5 bg-black/70 text-[8px] text-red-300">W</span>
                                )}
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={e => { e.stopPropagation(); toggleWall(i); }}
                                    className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-red-600/90 text-white text-[8px] opacity-0 hover:opacity-100 focus:opacity-100"
                                    title="Toggle Wall"
                                >
                                    W
                                </span>
                            </button>
                        ))}
                    </div>
                    {tileset.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-gray-500 text-xs text-center px-2">
                            Generate a tileset to begin.
                        </div>
                    )}
                </div>

                <Card className="bg-[#1a1a1a] border-2 border-amber-900/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase tracking-wider text-amber-200/90">Step 2: Map</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={handleGenerateLayout}
                            disabled={tileset.length === 0}
                            variant="secondary"
                            className="w-full game-button game-interactive game-focus-pixel bg-emerald-800/80 hover:bg-emerald-700 border-2 border-emerald-600/60"
                        >
                            <LayoutGrid size={12} /> AUTO-GENERATE WORLD
                        </Button>
                    </CardContent>
                </Card>
            </aside>

            {/* Main Canvas */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0f1016]">
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className="block cursor-crosshair pixelated"
                />
                <div
                    className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded border-2 border-amber-900/60 bg-[#141414] shadow-lg pixelated"
                    style={{ gap: GRID_UNIT }}
                >
                    <Button
                        size="icon"
                        variant={tool === 'PAINT' ? 'default' : 'ghost'}
                        onClick={() => setTool('PAINT')}
                        className="game-button game-interactive game-focus-pixel size-8"
                    >
                        <MousePointer2 size={14} />
                    </Button>
                    <div className="w-px h-4 bg-amber-900/50" />
                    <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="game-button game-interactive size-8 text-gray-400 hover:text-white">
                        <ZoomOut size={14} />
                    </Button>
                    <span className="text-xs font-mono w-10 text-center text-gray-300">{Math.round(zoom * 100)}%</span>
                    <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="game-button game-interactive size-8 text-gray-400 hover:text-white">
                        <ZoomIn size={14} />
                    </Button>
                    <div className="w-px h-4 bg-amber-900/50" />
                    <span className="text-[10px] text-gray-500 font-mono">{WORLD_WIDTH}×{WORLD_HEIGHT}</span>
                </div>
                <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded border border-amber-900/40 bg-black/70 text-[10px] text-gray-400 pixelated">
                    Hold SHIFT to Pan
                </div>
            </div>
        </div>
    );
};

const TilePreview: React.FC<{ tile: WorldTile }> = ({ tile }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, 32, 32);
            for (let i = 0; i < tile.pixels.length; i++) {
                const color = tile.palette[tile.pixels[i]];
                if (color && !isMagentaLikeHex(color)) {
                    ctx.fillStyle = color;
                    ctx.fillRect(i % 32, Math.floor(i / 32), 1, 1);
                }
            }
        }
    }, [tile]);
    return <canvas ref={canvasRef} width={32} height={32} className="w-full h-full pixelated" />;
};

export default WorldEngine;

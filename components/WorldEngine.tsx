
import React, { useState, useRef, useEffect } from 'react';
import { WorldData, WorldTile } from '../types';
import { generateTileset } from '../services/geminiService';
import { processTileset } from '../services/imageProcessingService';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../constants';
import { Wand2, RefreshCw, LayoutGrid, PaintBucket, MousePointer2, BoxSelect, ZoomIn, ZoomOut } from 'lucide-react';

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
        
        // Simple Cellular Automata for "Caves"
        // 1. Random Noise
        const newMap = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT);
        
        // Assume: Tile 0 is Floor, Tile 1 is Wall, Tile 2 is Decor/Liquid
        const floorIdx = 0;
        const wallIdx = tileset.length > 1 ? 1 : 0;
        
        for (let i = 0; i < newMap.length; i++) {
            newMap[i] = Math.random() < 0.45 ? wallIdx : floorIdx;
        }
        
        // 2. Smoothing Steps (4 iterations)
        for (let step = 0; step < 4; step++) {
            const tempMap = new Int32Array(newMap);
            for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
                for (let x = 1; x < WORLD_WIDTH - 1; x++) {
                    let wallCount = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dy === 0 && dx === 0) continue;
                            const idx = (y + dy) * WORLD_WIDTH + (x + dx);
                            if (tempMap[idx] === wallIdx) wallCount++;
                        }
                    }
                    const centerIdx = y * WORLD_WIDTH + x;
                    if (wallCount > 4) newMap[centerIdx] = wallIdx;
                    else if (wallCount < 4) newMap[centerIdx] = floorIdx;
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

    // Simple Tile Renderer
    const tileCache = useRef<Map<number, HTMLCanvasElement>>(new Map());
    
    const renderTileToCtx = (ctx: CanvasRenderingContext2D, tile: WorldTile, x: number, y: number, scale: number) => {
        // Check cache
        const tileId = tileset.indexOf(tile);
        let cached = tileCache.current.get(tileId);
        
        if (!cached) {
            // Create cache
            cached = document.createElement('canvas');
            cached.width = TILE_SIZE;
            cached.height = TILE_SIZE;
            const cCtx = cached.getContext('2d');
            if (cCtx) {
                for (let i = 0; i < tile.pixels.length; i++) {
                     const color = tile.palette[tile.pixels[i]];
                     if (color) {
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
        <div className="flex h-screen w-full bg-gray-950 text-gray-200 font-sans">
            {/* Sidebar */}
            <div className="w-80 flex-shrink-0 border-r border-gray-800 bg-gray-900 p-4 flex flex-col gap-4 z-20 shadow-xl">
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Step 1: The Theme</label>
                    <textarea 
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-xs h-20"
                        placeholder="e.g. Lava dungeon, Ice kingdom, Cyberpunk city streets..."
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                    />
                    <button 
                        onClick={handleGenerateTileset}
                        disabled={isGenerating}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={12}/> : <Wand2 size={12}/>}
                        GENERATE TILESET
                    </button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto border border-gray-800 rounded bg-gray-950 p-2">
                    <div className="grid grid-cols-4 gap-1">
                        {tileset.map((tile, i) => (
                            <div 
                                key={i}
                                onClick={() => setSelectedTileIndex(i)}
                                className={`relative aspect-square cursor-pointer border-2 group ${selectedTileIndex === i ? 'border-white' : 'border-transparent hover:border-gray-600'}`}
                            >
                                <TilePreview tile={tile} />
                                <div className="absolute bottom-0 right-0 p-0.5 bg-black/50 text-[8px]">
                                    {tile.isWall ? 'WALL' : ''}
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleWall(i); }}
                                    className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                                    title="Toggle Wall"
                                >
                                    W
                                </button>
                            </div>
                        ))}
                    </div>
                    {tileset.length === 0 && (
                        <div className="h-full flex items-center justify-center text-gray-600 text-xs text-center px-4">
                            Generate a tileset to begin building your world.
                        </div>
                    )}
                 </div>
                 
                 <div className="space-y-2 border-t border-gray-800 pt-4">
                     <label className="text-xs font-bold text-gray-400 uppercase">Step 2: The Map</label>
                     <button 
                        onClick={handleGenerateLayout}
                        disabled={tileset.length === 0}
                        className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2"
                     >
                        <LayoutGrid size={12}/> AUTO-GENERATE WORLD
                     </button>
                 </div>
            </div>

            {/* Main Canvas */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0f1016]">
                <canvas 
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className="block cursor-crosshair"
                />
                
                {/* Floating Toolbar */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-xl">
                    <button onClick={() => setTool('PAINT')} className={`p-2 rounded-full ${tool === 'PAINT' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        <MousePointer2 size={16} />
                    </button>
                    <div className="h-4 w-px bg-gray-700"/>
                    <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="text-gray-400 hover:text-white"><ZoomOut size={16}/></button>
                    <span className="text-xs font-mono w-12 text-center text-gray-300">{Math.round(zoom*100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="text-gray-400 hover:text-white"><ZoomIn size={16}/></button>
                    <div className="h-4 w-px bg-gray-700"/>
                    <div className="text-[10px] text-gray-500 font-mono">
                        {WORLD_WIDTH}x{WORLD_HEIGHT}
                    </div>
                </div>
                
                <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur px-3 py-1 rounded text-xs text-gray-400 border border-gray-800">
                    Hold SHIFT to Pan
                </div>
            </div>
        </div>
    );
};

// Mini Preview Component
const TilePreview: React.FC<{tile: WorldTile}> = ({tile}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.clearRect(0,0,32,32);
             for (let i = 0; i < tile.pixels.length; i++) {
                 const color = tile.palette[tile.pixels[i]];
                 if (color) {
                     ctx.fillStyle = color;
                     ctx.fillRect(i % 32, Math.floor(i / 32), 1, 1);
                 }
            }
        }
    }, [tile]);
    return <canvas ref={canvasRef} width={32} height={32} className="w-full h-full image-pixelated" />;
}

export default WorldEngine;

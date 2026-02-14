import React, { useRef, useEffect, useState } from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import { SPRITE_WIDTH, SPRITE_HEIGHT } from '../constants';

interface SpriteCanvasProps {
  matrix: SpriteMatrix;
  zoom: number;
  selectedColorIndex: number; // Index in the palette
  toolMode: ToolMode;
  onUpdatePixel: (index: number, colorIndex: number) => void;
  showGrid: boolean;
}

const SpriteCanvas: React.FC<SpriteCanvasProps> = ({
  matrix,
  zoom,
  selectedColorIndex,
  toolMode,
  onUpdatePixel,
  showGrid
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Draw the canvas whenever matrix or config changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Checkerboard Background (to show transparency)
    const checkSize = zoom; // 1 pixel in sprite = checkSize in canvas
    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = '#2d3748'; // Dark gray
        } else {
          ctx.fillStyle = '#1a202c'; // Darker gray
        }
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }

    // Draw Pixels
    for (let i = 0; i < matrix.pixels.length; i++) {
      const paletteIndex = matrix.pixels[i];
      const colorHex = matrix.palette[paletteIndex];

      if (colorHex !== null) {
        const x = i % SPRITE_WIDTH;
        const y = Math.floor(i / SPRITE_WIDTH);
        ctx.fillStyle = colorHex;
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }

    // Draw Grid Overlay
    if (showGrid && zoom > 4) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= SPRITE_WIDTH; x++) {
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, SPRITE_HEIGHT * zoom);
      }
      for (let y = 0; y <= SPRITE_HEIGHT; y++) {
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(SPRITE_WIDTH * zoom, y * zoom);
      }
      ctx.stroke();
    }
  }, [matrix, zoom, showGrid]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDrawing(true);
    handleDraw(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDrawing) {
      handleDraw(e);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleDraw = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    if (x >= 0 && x < SPRITE_WIDTH && y >= 0 && y < SPRITE_HEIGHT) {
      const index = y * SPRITE_WIDTH + x;
      
      let newColorIndex = selectedColorIndex;
      
      if (toolMode === ToolMode.ERASER) {
        newColorIndex = 0;
      } else if (toolMode === ToolMode.PICKER) {
        // We don't update pixel, we should update parent state (handled in parent usually, but simplifying here)
        // For now, let's just assume simple draw logic
        return; 
      }

      // Only update if different
      if (matrix.pixels[index] !== newColorIndex) {
        onUpdatePixel(index, newColorIndex);
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={SPRITE_WIDTH * zoom}
      height={SPRITE_HEIGHT * zoom}
      className="cursor-crosshair shadow-2xl border border-gray-700 bg-black rounded"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ touchAction: 'none' }} // Prevent scrolling while drawing on mobile
    />
  );
};

export default SpriteCanvas;
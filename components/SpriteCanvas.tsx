import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import {
  SPRITE_WIDTH,
  SPRITE_HEIGHT,
  CHECKER_LIGHT,
  CHECKER_DARK,
} from '../constants';
import { isMagentaLikeHex } from '../services/imageProcessingService';

function clampScale(scale: number, _readOnly?: boolean): number {
  // Integer scales only, so every sprite pixel maps to a whole number of screen pixels.
  return Math.max(1, Math.round(scale));
}

interface SpriteCanvasProps {
  matrix: SpriteMatrix;
  scale: number;
  selectedColorIndex: number;
  toolMode: ToolMode;
  onUpdatePixel: (index: number, colorIndex: number) => void;
  onPickColor?: (colorIndex: number) => void;
  showGrid: boolean;
  /** Optional: no interaction (e.g. 1x preview) */
  readOnly?: boolean;
  /** Optional: apply glow class */
  glow?: boolean;
  /** Optional: apply shadow class */
  shadow?: boolean;
}

const SpriteCanvas: React.FC<SpriteCanvasProps> = ({
  matrix,
  scale: scaleProp,
  selectedColorIndex,
  toolMode,
  onUpdatePixel,
  onPickColor,
  showGrid,
  readOnly = false,
  glow = false,
  shadow = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  // Active pointers: a second finger means pan/pinch, never draw.
  const pointersRef = useRef<Set<number>>(new Set());
  const scale = clampScale(scaleProp, readOnly);
  const width = SPRITE_WIDTH * scale;
  const height = SPRITE_HEIGHT * scale;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        const fill =
          (x + y) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
        ctx.fillStyle = fill;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    for (let i = 0; i < matrix.pixels.length; i++) {
      const paletteIndex = matrix.pixels[i];
      const colorHex = matrix.palette[paletteIndex];
      if (colorHex && !isMagentaLikeHex(colorHex)) {
        const x = i % SPRITE_WIDTH;
        const y = Math.floor(i / SPRITE_WIDTH);
        ctx.fillStyle = colorHex;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    if (showGrid && scale >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= SPRITE_WIDTH; x++) {
        const px = Math.round(x * scale);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      for (let y = 0; y <= SPRITE_HEIGHT; y++) {
        const py = Math.round(y * scale);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }
    }
  }, [matrix, scale, showGrid, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    pointersRef.current.add(e.pointerId);
    if (pointersRef.current.size > 1) {
      setIsDrawing(false);
      return;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setIsDrawing(toolMode !== ToolMode.PICKER);
    handleDraw(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly || !isDrawing || pointersRef.current.size > 1) return;
    handleDraw(e);
  };

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) setIsDrawing(false);
  }, []);

  const handleDraw = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const px = (e.clientX - rect.left) / scaleX;
    const py = (e.clientY - rect.top) / scaleY;
    const x = Math.floor(px / scale);
    const y = Math.floor(py / scale);
    if (x < 0 || x >= SPRITE_WIDTH || y < 0 || y >= SPRITE_HEIGHT) return;
    const index = y * SPRITE_WIDTH + x;
    let newColorIndex = selectedColorIndex;
    if (toolMode === ToolMode.ERASER) newColorIndex = 0;
    else if (toolMode === ToolMode.PICKER) {
      onPickColor?.(matrix.pixels[index] ?? 0);
      return;
    }
    if (matrix.pixels[index] !== newColorIndex) {
      onUpdatePixel(index, newColorIndex);
    }
  };

  const className = [
    'pixelated game-snap',
    glow ? 'sprite-glow' : '',
    shadow ? 'sprite-shadow' : '',
    readOnly ? '' : 'game-interactive',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        touchAction: readOnly ? 'auto' : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
};

export default SpriteCanvas;

import React, { useRef, useState } from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import {
  brushFootprint, floodFill, paintSegment, pixelsEqual, type Point,
} from '../services/editorTools';
import SpriteCanvas from './SpriteCanvas';

interface EditorCanvasProps {
  matrix: SpriteMatrix;
  scale: number;
  showGrid: boolean;
  toolMode: ToolMode;
  /** Palette index the brush / fill paints with (never 0). */
  colorIndex: number;
  brushSize: number;
  mirror: boolean;
  /** Live pixel updates while a stroke is in progress. */
  onLive: (pixels: number[]) => void;
  /** Called once per finished stroke with the pixels from before it began. */
  onCommit: (before: number[]) => void;
  /** Eyedropper result (0 = transparent). `viaTool` is false for right-click picks. */
  onPick: (paletteIndex: number, viaTool: boolean) => void;
  glow?: boolean;
  shadow?: boolean;
}

interface Stroke {
  pointerId: number;
  before: number[];
  work: number[];
  last: Point;
  start: Point;
  value: number;
  line: boolean;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({
  matrix, scale, showGrid, toolMode, colorIndex, brushSize, mirror, onLive, onCommit, onPick, glow, shadow,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const touches = useRef<Set<number>>(new Set());
  const [hover, setHover] = useState<Point | null>(null);
  const cell = Math.max(1, Math.round(scale));

  const cellAt = (e: React.PointerEvent): Point => {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * SPRITE_WIDTH),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * SPRITE_HEIGHT),
    };
  };
  const inBounds = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < SPRITE_WIDTH && p.y < SPRITE_HEIGHT;
  const size = toolMode === ToolMode.PENCIL || toolMode === ToolMode.ERASER ? brushSize : 1;

  const cancelStroke = () => {
    const s = stroke.current;
    stroke.current = null;
    if (s) onLive(s.before);
  };

  const finish = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    const s = stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    stroke.current = null;
    if (!pixelsEqual(s.before, s.work)) onCommit(s.before);
    if (e.pointerType !== 'mouse') setHover(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (e.pointerType === 'touch') {
      touches.current.add(e.pointerId);
      if (touches.current.size > 1) { cancelStroke(); return; } // second finger = pan / pinch
    }
    const p = cellAt(e);
    if (e.button === 2 || toolMode === ToolMode.PICKER) {
      if (inBounds(p)) onPick(matrix.pixels[p.y * SPRITE_WIDTH + p.x] ?? 0, e.button !== 2);
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setHover(p);
    const before = matrix.pixels;
    if (toolMode === ToolMode.FILL) {
      if (!inBounds(p)) return;
      const next = floodFill(before, SPRITE_WIDTH, SPRITE_HEIGHT, p.x, p.y, colorIndex, e.shiftKey || e.altKey);
      if (next !== before) { onLive(next); onCommit(before); }
      return;
    }
    const value = toolMode === ToolMode.ERASER ? 0 : colorIndex;
    const work = paintSegment(before, SPRITE_WIDTH, SPRITE_HEIGHT, p, p, value, size, mirror);
    stroke.current = { pointerId: e.pointerId, before, work, last: p, start: p, value, line: e.shiftKey };
    if (work !== before) onLive(work);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = cellAt(e);
    if (e.pointerType === 'mouse' || stroke.current) setHover(p);
    const s = stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (s.line) {
      s.work = paintSegment(s.before, SPRITE_WIDTH, SPRITE_HEIGHT, s.start, p, s.value, size, mirror);
    } else {
      // Interpolate between pointer samples so fast strokes leave no gaps.
      s.work = paintSegment(s.work, SPRITE_WIDTH, SPRITE_HEIGHT, s.last, p, s.value, size, mirror);
      s.last = p;
    }
    onLive(s.work);
  };

  const footprint: Point[] = hover && inBounds(hover) ? brushFootprint(hover.x, hover.y, size) : [];
  const minX = Math.min(...footprint.map((c) => c.x));
  const minY = Math.min(...footprint.map((c) => c.y));
  const cursor = toolMode === ToolMode.PICKER ? 'copy' : 'crosshair';

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Sprite canvas, ${SPRITE_WIDTH} by ${SPRITE_HEIGHT} pixels`}
      className="relative"
      style={{ width: SPRITE_WIDTH * cell, height: SPRITE_HEIGHT * cell, touchAction: 'none', cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={(e) => { touches.current.delete(e.pointerId); if (stroke.current?.pointerId === e.pointerId) cancelStroke(); }}
      onPointerLeave={(e) => { if (!stroke.current && e.pointerType === 'mouse') setHover(null); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <SpriteCanvas
        matrix={matrix}
        scale={cell}
        selectedColorIndex={colorIndex}
        toolMode={toolMode}
        onUpdatePixel={() => {}}
        showGrid={showGrid}
        readOnly
        glow={glow}
        shadow={shadow}
      />
      {footprint.length > 0 && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: minX * cell, top: minY * cell, width: size * cell, height: size * cell,
              outline: '1px solid #fff', boxShadow: 'inset 0 0 0 1px #000',
            }}
          />
          {mirror && (
            <span
              aria-hidden
              className="pointer-events-none absolute opacity-60"
              style={{
                left: (SPRITE_WIDTH - minX - size) * cell, top: minY * cell, width: size * cell, height: size * cell,
                outline: '1px dashed #fff', boxShadow: 'inset 0 0 0 1px #000',
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default EditorCanvas;

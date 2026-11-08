import React, { useCallback, useEffect, useRef } from 'react';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';

interface CanvasViewportProps {
  /** Largest integer scale that fits the viewport without scrolling. */
  onFitChange: (fit: number) => void;
  /** Pinch gesture crossed a step: +1 zoom in, -1 zoom out. */
  onPinchStep: (direction: 1 | -1) => void;
  children: React.ReactNode;
}

const PADDING = 12;

/**
 * Scrollable canvas stage for touch screens. One finger draws (the canvas has
 * touch-action: none); two fingers pan the stage and pinch to zoom.
 */
const CanvasViewport: React.FC<CanvasViewportProps> = ({ onFitChange, onPinchStep, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastGesture = useRef<{ cx: number; cy: number; dist: number } | null>(null);
  const pinchAccum = useRef(1);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const fit = Math.floor(Math.min((el.clientWidth - PADDING * 2) / SPRITE_WIDTH, (el.clientHeight - PADDING * 2) / SPRITE_HEIGHT));
    onFitChange(Math.max(2, Math.min(12, fit)));
  }, [onFitChange]);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const gesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastGesture.current = gesture();
    pinchAccum.current = 1;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = gesture();
    const prev = lastGesture.current;
    const el = ref.current;
    if (!now || !prev || !el) return;
    el.scrollLeft -= now.cx - prev.cx;
    el.scrollTop -= now.cy - prev.cy;
    if (prev.dist > 0) pinchAccum.current *= now.dist / prev.dist;
    if (pinchAccum.current > 1.3) { onPinchStep(1); pinchAccum.current = 1; }
    else if (pinchAccum.current < 0.77) { onPinchStep(-1); pinchAccum.current = 1; }
    lastGesture.current = now;
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    lastGesture.current = gesture();
  };

  return (
    <div
      ref={ref}
      className="game-scroll flex min-h-0 min-w-0 flex-1 self-stretch overflow-auto"
      style={{ touchAction: 'none', padding: PADDING }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="m-auto shrink-0">{children}</div>
    </div>
  );
};

export default CanvasViewport;

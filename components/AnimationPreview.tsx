import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { CHECKER_DARK, CHECKER_LIGHT, SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import { isMagentaLikeHex } from '../services/imageProcessingService';

interface AnimationPreviewProps {
  frames: number[][];
  palette: (string | null)[];
  label: string;
  fps: number;
  loop: boolean;
  scale?: number;
}

const AnimationPreview: React.FC<AnimationPreviewProps> = ({
  frames,
  palette,
  label,
  fps,
  loop,
  scale = 6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(true);
  }, [frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= frames.length - 1) {
          return loop ? 0 : current;
        }
        return current + 1;
      });
    }, 1000 / Math.max(1, fps));
    return () => window.clearInterval(timer);
  }, [fps, frames.length, loop, playing]);

  useEffect(() => {
    if (!loop && frames.length > 1 && frameIndex === frames.length - 1) setPlaying(false);
  }, [frameIndex, frames.length, loop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    const pixels = frames[frameIndex] ?? [];
    for (let i = 0; i < pixels.length; i++) {
      const color = palette[pixels[i]];
      if (!color || isMagentaLikeHex(color)) continue;
      ctx.fillStyle = color;
      ctx.fillRect((i % SPRITE_WIDTH) * scale, Math.floor(i / SPRITE_WIDTH) * scale, scale, scale);
    }
  }, [frameIndex, frames, palette, scale]);

  const stepFrame = (direction: -1 | 1) => {
    setPlaying(false);
    setFrameIndex((current) => (current + direction + frames.length) % frames.length);
  };

  return (
    <section className="flex flex-col items-center gap-3">
      <div className="relative border-2 border-amber-900/60 bg-black overflow-hidden sprite-shadow pixelated">
        <canvas
          ref={canvasRef}
          width={SPRITE_WIDTH * scale}
          height={SPRITE_HEIGHT * scale}
          className="pixelated block"
          style={{ width: SPRITE_WIDTH * scale, height: SPRITE_HEIGHT * scale }}
          aria-label={`${label} animation preview`}
        />
        <span className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] text-gray-300">
          {frames.length ? `${frameIndex + 1} / ${frames.length}` : 'No frames'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="game-button game-interactive p-2 text-gray-300 hover:text-white"
          onClick={() => frames.length && setFrameIndex(0)} aria-label="First frame" disabled={!frames.length}>
          <SkipBack size={14} />
        </button>
        <button type="button" className="game-button game-interactive p-2 text-amber-300 hover:text-white"
          onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause animation' : 'Play animation'}
          disabled={frames.length < 2}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" className="game-button game-interactive p-2 text-gray-300 hover:text-white"
          onClick={() => frames.length && stepFrame(1)} aria-label="Next frame" disabled={!frames.length}>
          <SkipForward size={14} />
        </button>
        <span className="ml-2 text-xs text-gray-400">{label} · {fps} FPS{loop ? ' · Loop' : ''}</span>
      </div>
    </section>
  );
};

export default AnimationPreview;

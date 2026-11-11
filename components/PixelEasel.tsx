import React from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import { GRID_UNIT } from '../constants';
import SpriteCanvas from './SpriteCanvas';
import EditorCanvas from './EditorCanvas';

interface PixelEaselProps {
  matrix: SpriteMatrix;
  scale: number;
  showGrid: boolean;
  toolMode: ToolMode;
  colorIndex: number;
  brushSize: number;
  mirror: boolean;
  onLive: (pixels: number[]) => void;
  onCommit: (before: number[]) => void;
  onPick: (paletteIndex: number, viaTool: boolean) => void;
  /** Phone layout: canvas only, no 1x reference. */
  compact?: boolean;
}

const PixelEasel: React.FC<PixelEaselProps> = ({ compact, ...props }) => {
  const editor = <EditorCanvas {...props} glow shadow />;
  if (compact) return editor;
  return (
    <div className="flex items-start gap-4 game-snap" style={{ gap: GRID_UNIT * 2 }}>
      {editor}
      <div className="sprite-shadow pixelated game-snap flex flex-col items-center" style={{ padding: GRID_UNIT }}>
        <span className="text-[10px] text-gray-400 mb-1">1×</span>
        <SpriteCanvas
          matrix={props.matrix}
          scale={1}
          selectedColorIndex={props.colorIndex}
          toolMode={ToolMode.PENCIL}
          onUpdatePixel={() => {}}
          readOnly
          showGrid={false}
        />
      </div>
    </div>
  );
};

export default PixelEasel;

import React from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import { GRID_UNIT } from '../constants';
import SpriteCanvas from './SpriteCanvas';

interface PixelEaselProps {
  matrix: SpriteMatrix;
  scale: number;
  selectedColorIndex: number;
  toolMode: ToolMode;
  onUpdatePixel: (index: number, colorIndex: number) => void;
  onPickColor?: (colorIndex: number) => void;
  showGrid: boolean;
}

const PixelEasel: React.FC<PixelEaselProps> = (props) => {
  return (
    <div className="flex items-start gap-4 game-snap" style={{ gap: GRID_UNIT * 2 }}>
      <SpriteCanvas
        {...props}
        glow
        shadow
      />
      <div
        className="sprite-shadow pixelated game-snap flex flex-col items-center"
        style={{ padding: GRID_UNIT }}
      >
        <span className="text-[10px] text-gray-500 mb-1" style={{ fontSize: 10 }}>
          1×
        </span>
        <SpriteCanvas
          {...props}
          scale={1}
          readOnly
          showGrid={false}
        />
      </div>
    </div>
  );
};

export default PixelEasel;

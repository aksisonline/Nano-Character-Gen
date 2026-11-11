import React from 'react';
import { Plus } from 'lucide-react';
import { GRID_UNIT } from '../constants';
import { isMagentaLikeHex } from '../services/imageProcessingService';

interface PalettePanelProps {
  palette: (string | null)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onUpdateColor: (index: number, newColor: string) => void;
  onAddColor: () => void;
  /** Desktop tool card, rendered above the colors so tools and colors sit together. */
  tools?: React.ReactNode;
}

export const CHECKER_SVG =
  "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTIwMmMiLz48cGF0aCBkPSJNMCAwSDRWMHoiIGZpbGw9IiMyZDM3NDgiLz48cGF0aCBkPSJNNCA0SDhWOHoiIGZpbGw9IiMyZDM3NDgiLz48L3N2Zz4=')";

/** Index 0 (transparent) and key-like / magenta entries are never shown as swatches; erasing is a tool. */
export function isPaintableColor(palette: (string | null)[], index: number): boolean {
  const color = palette[index];
  return index > 0 && !!color && !isMagentaLikeHex(color);
}

export function paintableIndices(palette: (string | null)[]): number[] {
  return palette.map((_, i) => i).filter((i) => isPaintableColor(palette, i));
}

/** Large current-color swatch. Activating it opens the native color picker to edit that palette entry. */
export const CurrentColor: React.FC<{
  palette: (string | null)[];
  index: number;
  onUpdateColor: (index: number, color: string) => void;
  compact?: boolean;
}> = ({ palette, index, onUpdateColor, compact }) => {
  const color = palette[index] ?? '#000000';
  return (
    <label
      className={`game-button relative flex shrink-0 cursor-pointer items-center gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-400 ${compact ? '' : 'w-full'}`}
      title="Current color (click to edit)"
    >
      <span
        className={`relative block shrink-0 border-2 border-white ${compact ? 'size-11' : 'size-14'}`}
        style={{ backgroundColor: color, boxShadow: '0 0 0 2px #000' }}
      />
      {!compact && (
        <span className="flex min-w-0 flex-col text-[10px] leading-tight">
          <span className="uppercase tracking-wider text-gray-400">Current</span>
          <span className="font-mono text-xs text-gray-100">{color.toUpperCase()}</span>
          <span className="text-gray-400">Click to edit</span>
        </span>
      )}
      <input
        type="color"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        value={color}
        onChange={(e) => onUpdateColor(index, e.target.value)}
        aria-label={`Edit current color, ${color}`}
      />
    </label>
  );
};

const PalettePanel: React.FC<PalettePanelProps> = ({
  palette,
  selectedIndex,
  onSelect,
  onUpdateColor,
  onAddColor,
  tools,
}) => {
  const cellSize = GRID_UNIT * 3;
  const indices = paintableIndices(palette);

  return (
    <aside
      className="shrink-0 border-l-4 border-amber-900/80 bg-[#141414] flex flex-col overflow-y-auto overflow-x-hidden pixelated"
      style={{ width: GRID_UNIT * 28, padding: GRID_UNIT * 2, gap: GRID_UNIT * 2 }}
    >
      {tools}
      {isPaintableColor(palette, selectedIndex) && (
        <CurrentColor palette={palette} index={selectedIndex} onUpdateColor={onUpdateColor} />
      )}
      <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider shrink-0">
        Palette ({indices.length})
      </h3>
      <div
        role="group"
        aria-label="Palette colors"
        className="grid overflow-y-auto min-h-0 p-1"
        style={{ gridTemplateColumns: `repeat(4, ${cellSize}px)`, gap: GRID_UNIT }}
      >
        {indices.map((index) => {
          const isSelected = selectedIndex === index;
          const color = palette[index]!;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Color ${index}, ${color}`}
              aria-pressed={isSelected}
              title={`${color.toUpperCase()}`}
              className="game-button game-focus-pixel relative border-2 shrink-0"
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: color,
                borderColor: isSelected ? '#fff' : '#3f3f46',
                boxShadow: isSelected ? '0 0 0 2px #000, 0 0 0 4px #f59e0b' : undefined,
              }}
            >
              {isSelected && (
                <span aria-hidden className="absolute bottom-0 right-0 size-2 bg-white" style={{ outline: '1px solid #000' }} />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddColor}
          aria-label="Add color"
          title="Add color"
          className="game-button game-focus-pixel border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-300 hover:text-white hover:border-gray-300 shrink-0"
          style={{ width: cellSize, height: cellSize }}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </aside>
  );
};

export default PalettePanel;

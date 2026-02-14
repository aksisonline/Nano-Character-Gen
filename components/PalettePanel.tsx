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
}

const CHECKER_SVG =
  "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTIwMmMiLz48cGF0aCBkPSJNMCAwSDRWMHoiIGZpbGw9IiMyZDM3NDgiLz48cGF0aCBkPSJNNCA0SDhWOHoiIGZpbGw9IiMyZDM3NDgiLz48L3N2Zz4=')";

const PalettePanel: React.FC<PalettePanelProps> = ({
  palette,
  selectedIndex,
  onSelect,
  onUpdateColor,
  onAddColor,
}) => {
  const cellSize = GRID_UNIT * 3;

  return (
    <aside
      className="shrink-0 border-l-4 border-amber-900/80 bg-[#141414] flex flex-col overflow-hidden pixelated"
      style={{
        width: GRID_UNIT * 28,
        padding: GRID_UNIT * 2,
      }}
    >
      <h3
        className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 shrink-0"
        style={{ marginBottom: GRID_UNIT * 2 }}
      >
        Palette ({palette.length})
      </h3>
      <div
        className="grid gap-2 overflow-y-auto min-h-0"
        style={{
          gridTemplateColumns: `repeat(4, ${cellSize}px)`,
          gap: GRID_UNIT,
        }}
      >
        {palette.map((color, index) => {
          const isTransparent = index === 0 || (color != null && isMagentaLikeHex(color));
          const isSelected = selectedIndex === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              className="game-interactive game-button game-focus-pixel relative border-2 transition-all w-full aspect-square shrink-0"
              style={{
                width: cellSize,
                height: cellSize,
                minWidth: cellSize,
                minHeight: cellSize,
                borderColor: isSelected ? '#fff' : 'transparent',
                boxShadow: isSelected ? '0 0 0 1px rgba(255,255,255,0.3)' : undefined,
              }}
            >
              {isTransparent ? (
                <div
                  className="w-full h-full opacity-60"
                  style={{ backgroundImage: CHECKER_SVG, backgroundSize: '8px 8px' }}
                />
              ) : (
                <>
                  <div
                    className="w-full h-full absolute inset-0"
                    style={{ backgroundColor: color ?? 'transparent' }}
                  />
                  <input
                    type="color"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={color ?? '#000000'}
                    onChange={(e) => onUpdateColor(index, e.target.value)}
                    aria-label={`Color ${index}`}
                  />
                </>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddColor}
          className="game-interactive game-button game-focus-pixel border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 hover:text-white hover:border-gray-400 shrink-0"
          style={{
            width: cellSize,
            height: cellSize,
            minWidth: cellSize,
            minHeight: cellSize,
          }}
          title="Add color"
        >
          <Plus size={16} />
        </button>
      </div>
    </aside>
  );
};

export default PalettePanel;

import React from 'react';
import { Trash2, Plus } from 'lucide-react';

interface PaletteEditorProps {
  palette: (string | null)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onUpdateColor: (index: number, newColor: string) => void;
  onAddColor: () => void;
}

const PaletteEditor: React.FC<PaletteEditorProps> = ({
  palette,
  selectedIndex,
  onSelect,
  onUpdateColor,
  onAddColor,
}) => {
  return (
    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 h-full overflow-y-auto">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Matrix Palette ({palette.length} colors)
      </h3>
      
      <div className="grid grid-cols-4 gap-2">
        {palette.map((color, index) => {
          const isTransparent = index === 0;
          const isSelected = selectedIndex === index;
          
          return (
            <div
              key={index}
              onClick={() => onSelect(index)}
              className={`
                relative group aspect-square rounded cursor-pointer border-2 transition-all
                ${isSelected ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.3)] scale-110 z-10' : 'border-transparent hover:border-gray-500'}
              `}
            >
              {isTransparent ? (
                <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTIwMmMiLz48cGF0aCBkPSJNMCAwSDRWMHoiIGZpbGw9IiMyZDM3NDgiLz48cGF0aCBkPSJNNAo0SDhWOHoiIGZpbGw9IiMyZDM3NDgiLz48L3N2Zz4=')] rounded-sm opacity-50" />
              ) : (
                <>
                  <div 
                    className="w-full h-full rounded-sm" 
                    style={{ backgroundColor: color || 'transparent' }} 
                  />
                  <input
                    type="color"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={color || '#000000'}
                    onChange={(e) => onUpdateColor(index, e.target.value)}
                  />
                </>
              )}
              
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                {index}
              </div>
            </div>
          );
        })}

        <button
          onClick={onAddColor}
          className="aspect-square rounded border border-dashed border-gray-600 flex items-center justify-center text-gray-500 hover:text-white hover:border-white transition-colors"
          title="Add Color"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};

export default PaletteEditor;
import React from 'react';
import { SpriteMatrix, ToolMode } from '../types';
import { GRID_UNIT } from '../constants';
import SpriteCanvas from './SpriteCanvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Button } from '@/components/ui/8bit/button';
import { Input } from '@/components/ui/8bit/input';
import { Label } from '@/components/ui/8bit/label';

interface CharacterCreateViewProps {
  characterName: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onCreate: () => void;
  isGenerating: boolean;
  isAnimating: boolean;
  error: string | null;
  matrix: SpriteMatrix;
  scale: number;
  onEditSprite: () => void;
}

const CharacterCreateView: React.FC<CharacterCreateViewProps> = ({
  characterName,
  onNameChange,
  description,
  onDescriptionChange,
  onCreate,
  isGenerating,
  isAnimating,
  error,
  matrix,
  scale,
  onEditSprite,
}) => {
  const hasSprite =
    matrix.pixels.some((p) => p !== 0) ||
    (matrix.meta?.name && matrix.meta.name !== 'init');
  const isEmpty = !hasSprite && !isGenerating;

  return (
    <div className="game-layout-row bg-[#0d0d0d] text-gray-200 flex-1 min-h-0">
      {/* Center: preview */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="game-center flex-1 min-h-0 relative" style={{ padding: GRID_UNIT * 6 }}>
          {isEmpty && (
            <p className="text-sm text-gray-600 absolute inset-0 flex items-center justify-center pointer-events-none retro">
              Enter your name and create
            </p>
          )}
          {(isGenerating || isAnimating) && (
            <p className="text-xs text-amber-400/90 absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none retro">
              {isGenerating ? 'Creating sprite…' : 'Creating animations…'}
            </p>
          )}
          {hasSprite && !isEmpty && (
            <div className="sprite-glow sprite-shadow pixelated game-snap">
              <SpriteCanvas
                matrix={matrix}
                scale={scale}
                selectedColorIndex={0}
                toolMode={ToolMode.PENCIL}
                onUpdatePixel={() => {}}
                showGrid={false}
                readOnly
                glow
                shadow
              />
            </div>
          )}
        </div>
      </main>

      {/* Right: 8bitcn panel */}
      <aside
        className="shrink-0 border-l border-foreground/20 flex flex-col p-4"
        style={{ width: GRID_UNIT * 40, padding: GRID_UNIT * 3 }}
      >
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm retro">Create character</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="char-name" className="text-xs retro">
                Enter your name
              </Label>
              <Input
                id="char-name"
                value={characterName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Character name"
                className="retro game-focus-pixel"
                font="retro"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="char-desc" className="text-xs retro">
                Description
              </Label>
              <Input
                id="char-desc"
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="e.g. Cyberpunk samurai"
                className="retro game-focus-pixel"
                font="retro"
              />
            </div>
            <Button
              onClick={onCreate}
              disabled={isGenerating || !characterName.trim()}
              className="w-full retro game-button game-focus-pixel"
            >
              {isGenerating ? 'Creating…' : 'Create'}
            </Button>
            {error && (
              <p className="text-[10px] text-red-400">{error}</p>
            )}
          </CardContent>
        </Card>

        {hasSprite && (
          <Card className="w-full mt-4">
            <CardContent className="pt-4">
              <p className="text-xs font-bold text-foreground retro uppercase">
                {characterName.trim() || matrix.meta?.name || 'Character'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 retro">
                32×48 · Animations in background
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full retro game-button game-focus-pixel"
                onClick={onEditSprite}
              >
                Edit sprite
              </Button>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
};

export default CharacterCreateView;

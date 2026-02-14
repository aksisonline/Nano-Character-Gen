import React from 'react';
import { SpriteMatrix } from '../types';
import { BASE_CHARACTERS } from '../baseCharacters';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { GRID_UNIT } from '../constants';
import { User as UserIcon } from 'lucide-react';

interface BaseCharacterSelectProps {
  onSelect: (matrix: SpriteMatrix) => void;
}

const BaseCharacterSelect: React.FC<BaseCharacterSelectProps> = ({ onSelect }) => {
  return (
    <Card className="bg-[#1a1a1a] border-amber-900/60">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs flex items-center gap-1.5 retro">
          <UserIcon size={12} /> Base characters
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 flex gap-2" style={{ gap: GRID_UNIT }}>
        {BASE_CHARACTERS.map((base) => (
          <Button
            key={base.id}
            variant="outline"
            size="sm"
            className="flex-1 retro text-[10px] py-1 game-button game-interactive game-focus-pixel"
            onClick={() => onSelect(base.matrix)}
          >
            {base.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
};

export default BaseCharacterSelect;

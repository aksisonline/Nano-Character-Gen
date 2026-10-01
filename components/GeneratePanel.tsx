import React from 'react';
import { Wand2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Textarea } from '@/components/ui/8bit/textarea';
import { Label } from '@/components/ui/8bit/label';
import { SPRITE_WIDTH, SPRITE_HEIGHT, GRID_UNIT } from '../constants';

interface GeneratePanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onConfirmAndAnimate: () => void;
}

const GeneratePanel: React.FC<GeneratePanelProps> = ({
  prompt,
  onPromptChange,
  isGenerating,
  error,
  onGenerate,
  onConfirmAndAnimate,
}) => {
  return (
    <>
      <Card className="bg-[#1a1a1a] border-amber-900/60">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs retro">Base sprite</CardTitle>
          <span className="text-[10px] text-gray-500">
            {SPRITE_WIDTH}×{SPRITE_HEIGHT} px
          </span>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2" style={{ gap: GRID_UNIT }}>
          <Label className="text-[10px] text-gray-400">Describe your character</Label>
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="e.g. A robotic wizard with a glowing staff..."
            className="min-h-20 resize-none bg-[#0d0d0d] border-2 border-amber-900/60 text-xs retro game-focus-pixel"
            font="retro"
          />
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full retro game-button game-interactive game-focus-pixel"
          >
            {isGenerating ? <RefreshCw className="animate-spin size-3" /> : <Wand2 size={14} />}
            {isGenerating ? 'Forging…' : 'Generate base'}
          </Button>
          {error && (
            <div
              className="text-[10px] text-red-400 bg-red-950/50 border border-red-900/50 px-2 py-1.5 rounded-none"
              style={{ padding: GRID_UNIT }}
            >
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#1a1a1a] border-green-900/50">
        <CardContent className="p-3" style={{ padding: GRID_UNIT * 2 }}>
          <Button
            onClick={onConfirmAndAnimate}
            disabled={isGenerating}
            variant="secondary"
            className="w-full retro text-xs border-2 border-green-800/50 game-button game-interactive game-focus-pixel"
          >
            {isGenerating ? (
              <RefreshCw className="animate-spin size-3" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {isGenerating ? 'Working…' : 'Open animation studio'}
          </Button>
          <p className="text-[10px] text-gray-500 mt-1.5 text-center">
            Add and generate only the animation clips you need.
          </p>
        </CardContent>
      </Card>
    </>
  );
};

export default GeneratePanel;

import React from 'react';
import { Wand2, ArrowLeft, CheckCircle2, RefreshCw } from 'lucide-react';
import { AppPhase } from '../types';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Textarea } from '@/components/ui/8bit/textarea';
import { Label } from '@/components/ui/8bit/label';
import { SPRITE_WIDTH, SPRITE_HEIGHT, GRID_UNIT } from '../constants';

interface GeneratePanelProps {
  phase: AppPhase;
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onBackToEditor: () => void;
  onConfirmAndAnimate: () => void;
}

const GeneratePanel: React.FC<GeneratePanelProps> = ({
  phase,
  prompt,
  onPromptChange,
  isGenerating,
  error,
  onGenerate,
  onBackToEditor,
  onConfirmAndAnimate,
}) => {
  const isEditor = phase === AppPhase.EDITOR;

  return (
    <>
      <Card className="bg-[#1a1a1a] border-amber-900/60">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs retro">Phase 1: Base sprite</CardTitle>
          <span className="text-[10px] text-gray-500">
            {SPRITE_WIDTH}×{SPRITE_HEIGHT} px
          </span>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2" style={{ gap: GRID_UNIT }}>
          <Label className="text-[10px] text-gray-400">Describe your character</Label>
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={!isEditor}
            placeholder="e.g. A robotic wizard with a glowing staff..."
            className="min-h-20 resize-none bg-[#0d0d0d] border-2 border-amber-900/60 text-xs retro game-focus-pixel"
            font="retro"
          />
          {isEditor ? (
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="w-full retro game-button game-interactive game-focus-pixel"
            >
              {isGenerating ? (
                <RefreshCw className="animate-spin size-3" />
              ) : (
                <Wand2 size={14} />
              )}
              {isGenerating ? 'Forging…' : 'Generate base'}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full retro game-button game-interactive game-focus-pixel"
              onClick={onBackToEditor}
            >
              <ArrowLeft size={14} /> Back to editor
            </Button>
          )}
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
            {isGenerating ? 'Animating…' : 'Confirm & animate'}
          </Button>
          <p className="text-[10px] text-gray-500 mt-1.5 text-center">
            Idle, Walk, Jump, Special
          </p>
        </CardContent>
      </Card>
    </>
  );
};

export default GeneratePanel;

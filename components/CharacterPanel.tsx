import React from 'react';
import { Pencil, Eraser, Pipette, Download, Code } from 'lucide-react';
import { ToolMode, AppPhase } from '../types';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import GeneratePanel from './GeneratePanel';
import { GRID_UNIT } from '../constants';

interface CharacterPanelProps {
  phase: AppPhase;
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  error: string | null;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onGenerate: () => void;
  onBackToEditor: () => void;
  onConfirmAndAnimate: () => void;
  onDownloadPng: () => void;
  showJson: boolean;
  onToggleJson: () => void;
  onBackToCreate?: () => void;
}

const CharacterPanel: React.FC<CharacterPanelProps> = (props) => {
  const {
    phase,
    toolMode,
    onToolModeChange,
    showJson,
    onToggleJson,
    onBackToCreate,
  } = props;
  const isEditor = phase === AppPhase.EDITOR;

  return (
    <aside
      className="shrink-0 border-r-4 border-amber-900/80 bg-[#141414] flex flex-col overflow-hidden"
      style={{
        width: GRID_UNIT * 40,
        padding: GRID_UNIT * 2,
        gap: GRID_UNIT * 2,
      }}
    >
      <header
        className="border-b-4 border-amber-900/80 pb-3 shrink-0"
        style={{ paddingBottom: GRID_UNIT * 2 }}
      >
        {onBackToCreate && (
          <button
            type="button"
            onClick={onBackToCreate}
            className="game-button game-interactive game-focus-pixel text-[10px] text-gray-500 hover:text-amber-400 mb-2"
          >
            ← Back
          </button>
        )}
        <h1 className="text-lg font-bold text-amber-400 retro tracking-wide">
          PIXELFORGE
        </h1>
        <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest">
          8-Bit Character Gen
        </p>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto min-h-0" style={{ gap: GRID_UNIT * 2 }}>
        <GeneratePanel
          phase={phase}
          prompt={props.prompt}
          onPromptChange={props.onPromptChange}
          isGenerating={props.isGenerating}
          error={props.error}
          onGenerate={props.onGenerate}
          onBackToEditor={props.onBackToEditor}
          onConfirmAndAnimate={props.onConfirmAndAnimate}
        />

        {isEditor && (
          <Card className="bg-[#1a1a1a] border-amber-900/60">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs retro">Easel</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex gap-1" style={{ gap: GRID_UNIT }}>
                {[
                  { mode: ToolMode.PENCIL, icon: Pencil, label: 'Draw' },
                  { mode: ToolMode.ERASER, icon: Eraser, label: 'Erase' },
                  { mode: ToolMode.PICKER, icon: Pipette, label: 'Pick' },
                ].map((tool) => (
                  <Button
                    key={tool.mode}
                    variant={toolMode === tool.mode ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 retro text-[10px] game-button game-interactive game-focus-pixel"
                    onClick={() => onToolModeChange(tool.mode)}
                  >
                    <tool.icon size={12} /> {tool.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div
        className="mt-auto border-t-4 border-amber-900/80 pt-3 space-y-2 shrink-0"
        style={{
          paddingTop: GRID_UNIT * 2,
          gap: GRID_UNIT,
        }}
      >
        <Button
          variant="outline"
          size="sm"
          className="w-full retro text-[10px] game-button game-interactive game-focus-pixel"
          onClick={props.onDownloadPng}
        >
          <Download size={12} /> Download PNG
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full retro text-[10px] game-button game-interactive game-focus-pixel"
          onClick={onToggleJson}
        >
          <Code size={12} /> {showJson ? 'Hide' : 'View'} matrix JSON
        </Button>
      </div>
    </aside>
  );
};

export default CharacterPanel;

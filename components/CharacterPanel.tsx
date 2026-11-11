import React from 'react';
import { Download, Code } from 'lucide-react';
import { Button } from '@/components/ui/8bit/button';
import GeneratePanel from './GeneratePanel';
import { GRID_UNIT } from '../constants';

interface CharacterPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onConfirmAndAnimate: () => void;
  onDownloadPng: () => void;
  showJson: boolean;
  onToggleJson: () => void;
  onBackToCreate?: () => void;
}

const CharacterPanel: React.FC<CharacterPanelProps> = (props) => {
  const {
    showJson,
    onToggleJson,
    onBackToCreate,
  } = props;

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
          Sprite editor
        </p>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto min-h-0" style={{ gap: GRID_UNIT * 2 }}>
        <GeneratePanel
          prompt={props.prompt}
          onPromptChange={props.onPromptChange}
          isGenerating={props.isGenerating}
          error={props.error}
          onGenerate={props.onGenerate}
          onConfirmAndAnimate={props.onConfirmAndAnimate}
        />

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

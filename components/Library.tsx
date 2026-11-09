import { useCallback, useEffect, useState } from 'react';
import { Copy, FilePlus2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/8bit/button';
import {
  deleteCharacter, duplicateCharacter, listCharacters,
  type CharacterSummary, type StorageUsage,
} from '../services/characterApi';

interface LibraryProps {
  onOpen: (id: string) => Promise<void>;
  onNew: () => void;
  /** Id of the character currently open in the studio, highlighted in the list. */
  currentId: string | null;
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function Library({ onOpen, onNew, currentId }: LibraryProps) {
  const [items, setItems] = useState<CharacterSummary[] | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listCharacters();
      setItems(data.items);
      setUsage(data.usage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your characters.');
      setItems((current) => current ?? []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusyId(null); }
  };

  const open = async (id: string) => {
    setBusyId(id);
    try { await onOpen(id); } catch (err) { setError(err instanceof Error ? err.message : 'Could not open that character.'); setBusyId(null); }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#0d0d0d] px-4 py-6 text-gray-200 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="retro text-sm text-amber-400">MY CHARACTERS</h1>
            {usage && <p className="mt-2 text-xs text-gray-500">{usage.items}/{usage.maxItems} saved. Changes save automatically.</p>}
          </div>
          <Button onClick={onNew} className="retro game-button h-11 text-[10px]"><FilePlus2 size={14} className="mr-2" />New character</Button>
        </header>

        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        {items === null && <p className="retro text-xs text-gray-500">Loading…</p>}
        {items?.length === 0 && !error && (
          <p className="border-2 border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
            Nothing saved yet. Create a character and it will appear here automatically.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {items?.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-3 border-2 bg-[#141414] p-4 ${item.id === currentId ? 'border-amber-700' : 'border-gray-800'}`}
            >
              <button type="button" onClick={() => void open(item.id)} className="min-w-0 flex-1 text-left" aria-label={`Open ${item.name}`}>
                <span className="block truncate text-sm font-bold text-gray-100">{item.name}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  {new Date(item.updatedAt).toLocaleString()} · {kb(item.bytes)}{item.id === currentId ? ' · open' : ''}
                </span>
              </button>
              <div className="flex gap-2">
                <Button size="sm" className="game-button h-11 min-w-11" disabled={busyId === item.id}
                  onClick={() => void open(item.id)}>Open</Button>
                <Button size="icon" variant="outline" className="game-button h-11 w-11" aria-label={`Duplicate ${item.name}`} disabled={busyId === item.id}
                  onClick={() => act(item.id, () => duplicateCharacter(item.id, `${item.name} copy`.slice(0, 80)))}><Copy size={16} /></Button>
                <Button size="icon" variant="outline" className="game-button h-11 w-11 text-red-400" aria-label={`Delete ${item.name}`} disabled={busyId === item.id}
                  onClick={() => { if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) void act(item.id, () => deleteCharacter(item.id)); }}><Trash2 size={16} /></Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

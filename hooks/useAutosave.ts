import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterDoc } from '../shared/character';
import { getCharacter, putCharacter } from '../services/characterApi';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const DEBOUNCE_MS = 2000;
const MESSAGES: Record<string, string> = {
  too_large: 'This character is too large to save.',
  item_limit: 'Storage is full. Delete a character to keep saving.',
  storage_limit: 'Storage is full. Delete a character to keep saving.',
  signed_out: 'Signed out. Sign in again to keep saving.',
};

/**
 * Debounced, single-flight autosave. Edits are coalesced client-side (one write per quiet period, one in
 * flight at a time, latest state wins). The server enforces ownership, validation, caps and a write rate limit.
 */
export function useAutosave(build: () => CharacterDoc | null, enabled: boolean, deps: unknown[]) {
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const revRef = useRef<number | null>(null);
  const lastKey = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef(false);
  const dirty = useRef(false);
  const gen = useRef(0);
  const buildRef = useRef(build);
  buildRef.current = build;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const run = useCallback(async () => {
    if (!enabledRef.current) return;
    if (inflight.current) { dirty.current = true; return; }
    const doc = buildRef.current();
    if (!doc) return;
    const key = JSON.stringify(doc);
    if (key === lastKey.current) return;
    const myGen = gen.current;
    inflight.current = true;
    setState('saving');
    setMessage(null);
    if (!idRef.current) { idRef.current = crypto.randomUUID(); setCurrentId(idRef.current); }
    const id = idRef.current;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await putCharacter(id, doc, revRef.current);
        if (myGen !== gen.current) return; // a different character was opened meanwhile; drop this result
        if (res.ok === true) { revRef.current = res.rev; lastKey.current = key; setState('saved'); return; }
        if (res.reason === 'conflict' && res.currentRev) { revRef.current = res.currentRev; continue; }
        if (res.reason === 'exists') {
          try { revRef.current = (await getCharacter(id)).rev; continue; } catch { /* fall through to error */ }
        }
        if (res.reason === 'rate_limit') {
          await new Promise((r) => setTimeout(r, Math.min(res.retryAfterMs ?? 3000, 10_000)));
          continue;
        }
        setState('error');
        setMessage(MESSAGES[res.reason] ?? 'Could not save. Your changes are still here; we will retry on the next edit.');
        return;
      }
      setState('error');
      setMessage('Could not save. We will retry on the next edit.');
    } catch {
      if (myGen === gen.current) { setState('error'); setMessage('You appear to be offline. We will retry on the next edit.'); }
    } finally {
      inflight.current = false;
      if (dirty.current && myGen === gen.current) { dirty.current = false; timer.current = setTimeout(() => void run(), 500); }
      else dirty.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    const flush = () => { clearTimeout(timer.current); void run(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); };
  }, [run]);

  /** Start editing an existing saved character (its current state counts as already saved). */
  const open = useCallback((id: string, rev: number, doc: CharacterDoc) => {
    gen.current++; clearTimeout(timer.current);
    idRef.current = id; revRef.current = rev; lastKey.current = JSON.stringify(doc);
    setCurrentId(id); setState('saved'); setMessage(null);
  }, []);
  /** Start a brand new character; the next save creates a new item. */
  const reset = useCallback(() => {
    gen.current++; clearTimeout(timer.current);
    idRef.current = null; revRef.current = null; lastKey.current = '';
    setCurrentId(null); setState('idle'); setMessage(null);
  }, []);
  const flushNow = useCallback(() => { clearTimeout(timer.current); return run(); }, [run]);

  return { state, message, currentId, open, reset, flushNow };
}

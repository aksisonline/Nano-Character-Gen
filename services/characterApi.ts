import type { CharacterDoc } from '../shared/character';

export interface CharacterSummary { id: string; name: string; updatedAt: number; bytes: number }
export interface StorageUsage { items: number; bytes: number; maxItems: number; maxBytes: number; maxItemBytes: number }
export type PutOutcome =
  | { ok: true; rev: number }
  | { ok: false; reason: string; currentRev?: number; retryAfterMs?: number };

const json = { 'Content-Type': 'application/json' };
const opts: RequestInit = { credentials: 'same-origin' };

export async function listCharacters(): Promise<{ items: CharacterSummary[]; usage: StorageUsage }> {
  const res = await fetch('/api/characters', opts);
  if (!res.ok) throw new Error(res.status === 401 ? 'Sign in required.' : 'Could not load your characters.');
  return res.json();
}

export async function getCharacter(id: string): Promise<{ rev: number; doc: CharacterDoc }> {
  const res = await fetch(`/api/characters/${id}`, opts);
  if (res.status === 404) throw new Error('That character no longer exists.');
  if (!res.ok) throw new Error('Could not open that character.');
  return res.json();
}

export async function putCharacter(id: string, doc: CharacterDoc, baseRev: number | null): Promise<PutOutcome> {
  const res = await fetch(`/api/characters/${id}`, { ...opts, method: 'PUT', headers: json, body: JSON.stringify({ doc, baseRev }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, rev: data.rev };
  return { ok: false, reason: res.status === 401 ? 'signed_out' : data.error ?? 'error', currentRev: data.currentRev, retryAfterMs: data.retryAfterMs };
}

export async function deleteCharacter(id: string): Promise<void> {
  const res = await fetch(`/api/characters/${id}`, { ...opts, method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('Could not delete that character.');
}

export async function duplicateCharacter(id: string, newName: string): Promise<void> {
  const res = await fetch(`/api/characters/${id}/duplicate`, {
    ...opts, method: 'POST', headers: json, body: JSON.stringify({ newId: crypto.randomUUID(), newName }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error === 'item_limit' || data.error === 'storage_limit'
    ? 'Storage is full. Delete a character first.' : 'Could not duplicate that character.');
}

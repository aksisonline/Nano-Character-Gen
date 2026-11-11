import type { StorageUsage } from './characterApi';
import type { UsageInfo } from './geminiService';

export type GenerationSource = 'aks' | 'openai';
export interface LinkedAccount {
  provider: 'openai';
  label: string;
  linkedAt: string;
  status: 'active' | 'reauth_required';
  capabilities: { identity: true; planUsage: boolean; imageGeneration: boolean };
}
export interface AccountData {
  user: { name: string | null; email: string | null };
  usage: UsageInfo | null;
  storage: StorageUsage | null;
  /** null = the account service could not tell us (not the same as "nothing linked"). */
  connections: LinkedAccount[] | null;
  settings: { generationSource: GenerationSource; openaiAvailable: boolean };
  links: { manage: string; connectOpenai: string };
}

const opts: RequestInit = { credentials: 'same-origin' };
const json = { 'Content-Type': 'application/json' };

export async function getAccount(): Promise<AccountData> {
  const res = await fetch('/api/account', opts);
  if (!res.ok) throw new Error(res.status === 401 ? 'Sign in required.' : 'Could not load your account.');
  return res.json();
}

export async function setGenerationSource(generationSource: GenerationSource): Promise<void> {
  const res = await fetch('/api/account/settings', { ...opts, method: 'PUT', headers: json, body: JSON.stringify({ generationSource }) });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error === 'openai_unavailable' ? 'Your OpenAI account cannot be used for generation right now.' : 'Could not save that setting.');
}

export async function unlinkOpenAI(): Promise<void> {
  const res = await fetch('/api/account/connections/openai/unlink', { ...opts, method: 'POST' });
  if (!res.ok) throw new Error('Could not disconnect OpenAI. Please try again.');
}

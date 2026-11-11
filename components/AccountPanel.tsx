import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/8bit/button';
import {
  getAccount, setGenerationSource, unlinkOpenAI,
  type AccountData, type GenerationSource, type LinkedAccount,
} from '../services/accountApi';

// Mirrors the AKS-CESS account page (aks-access/frontend): handover header, name + email, primary/secondary buttons,
// then an expandable settings list. The rows here are PixelForge's: generations, saved characters, connected accounts.
type Row = 'generations' | 'characters' | 'connections' | null;

interface Props {
  /** Set when the browser just came back from the AKS-CESS link flow. */
  returned: 'linked' | 'link_failed' | null;
  onBack: () => void;
  onOpenLibrary: () => void;
  /** Called after anything that changes which source generations use, so the header chip updates. */
  onChanged: () => void;
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Handover() {
  return (
    <div className="mb-8 flex items-start justify-center gap-1" role="img" aria-label="AKS-CESS to PixelForge">
      <div className="flex w-28 flex-col items-center gap-3" aria-hidden>
        <span className="grid size-14 place-items-center bg-gray-100 text-[13px] font-bold tracking-wider text-black">AKS</span>
        <span className="text-[10px] tracking-[0.15em] text-gray-500">AKS-CESS</span>
      </div>
      <span className="flex h-14 items-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => <i key={i} className="size-1.5 bg-amber-400 opacity-40" />)}
      </span>
      <div className="flex w-28 flex-col items-center gap-3" aria-hidden>
        <span className="grid size-14 place-items-center border border-amber-900/70 bg-[#14110a]">
          <img src="/sprite.svg" alt="" width={32} height={32} className="pixelated" />
        </span>
        <span className="retro text-[8px] text-amber-400">PIXELFORGE</span>
      </div>
    </div>
  );
}

function Accordion({ id, title, summary, open, onToggle, children }: {
  id: string; title: string; summary?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="border-b border-gray-800">
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="game-interactive flex w-full items-center justify-between gap-3 py-3 text-left text-[13px] text-gray-100"
      >
        <span>{title}</span>
        <span className="flex items-center gap-3 text-xs text-gray-500">{summary}<span aria-hidden>{open ? '–' : '+'}</span></span>
      </button>
      {open && <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="pb-4 text-xs leading-relaxed text-gray-400">{children}</div>}
    </div>
  );
}

function sourceReason(data: AccountData, link: LinkedAccount | undefined): string | null {
  if (data.settings.openaiAvailable) return null;
  if (data.connections === null) return 'The account service is unavailable, so your connections cannot be checked.';
  if (!link) return 'Link an OpenAI account first.';
  if (link.status === 'reauth_required') return 'Reconnect your OpenAI account to use it.';
  return 'Not available yet: OpenAI does not currently let apps use a ChatGPT plan for image generation. Your link is kept and this unlocks automatically when it does.';
}

export default function AccountPanel({ returned, onBack, onOpenLibrary, onChanged }: Props) {
  const [data, setData] = useState<AccountData | null>(null);
  const [open, setOpen] = useState<Row>(returned ? 'connections' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    returned === 'linked' ? 'OpenAI account linked.' : null,
  );
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getAccount()); setError((e) => (e === 'Could not load your account.' ? null : e)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load your account.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (task: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { const message = await task(); if (message) setNotice(message); await load(); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.reload();
  };

  const toggle = (row: Exclude<Row, null>) => { setOpen(open === row ? null : row); setConfirmUnlink(false); };
  const openai = data?.connections?.find((c) => c.provider === 'openai');
  const source: GenerationSource = data?.settings.generationSource ?? 'aks';
  const reason = data ? sourceReason(data, openai) : null;
  const usage = data?.usage;
  const storage = data?.storage;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#0d0d0d] px-6 py-8 text-gray-200">
      <section className="mx-auto w-full max-w-sm" aria-labelledby="account-title">
        <Handover />
        <h1 id="account-title" className="retro mb-4 text-sm text-amber-400">ACCOUNT</h1>
        <p className="text-sm text-gray-100">{data?.user.name ?? '…'}</p>
        {data?.user.email && <p className="mt-1 text-xs text-gray-500">{data.user.email}</p>}

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onBack} className="retro game-button h-11 w-full text-[10px]">Back to studio</Button>
          <Button variant="outline" onClick={() => void signOut()} className="retro game-button h-11 w-full text-[10px]">Sign out</Button>
        </div>

        {notice && <p role="status" className="mt-5 border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">{notice}</p>}
        {returned === 'link_failed' && !notice && (
          <p role="alert" className="mt-5 border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            Linking didn’t complete. It may have been cancelled, expired, or that OpenAI account is already linked to a different AKS account.
          </p>
        )}

        <section className="mt-8 border-t border-gray-800 pt-6" aria-label="PixelForge settings">
          <h2 className="mb-2 text-xs font-bold text-gray-100">PixelForge settings</h2>

          <Accordion
            id="gen" title="Generations" open={open === 'generations'} onToggle={() => toggle('generations')}
            summary={source === 'openai' ? 'OpenAI plan' : usage ? `${usage.remaining}/${usage.limit} left` : undefined}
          >
            <p className="mb-3">Choose what pays for each sprite or animation you generate.</p>
            <fieldset className="flex flex-col gap-2" disabled={busy || !data}>
              <legend className="sr-only">Generation source</legend>
              <label className={`flex cursor-pointer items-start gap-3 border-2 p-3 ${source === 'aks' ? 'border-amber-700' : 'border-gray-800'}`}>
                <input type="radio" name="source" checked={source === 'aks'} onChange={() => void run(() => setGenerationSource('aks'))} className="mt-0.5 accent-amber-500" />
                <span>
                  <span className="block text-[13px] text-gray-100">AKS allowance</span>
                  <span className="block">{usage ? `${usage.remaining} of ${usage.limit} left this week · resets ${new Date(usage.resetsAt).toLocaleString()}` : 'Weekly generations included with your account.'}</span>
                </span>
              </label>
              <label className={`flex items-start gap-3 border-2 p-3 ${source === 'openai' ? 'border-amber-700' : 'border-gray-800'} ${reason ? 'opacity-60' : 'cursor-pointer'}`}>
                <input type="radio" name="source" checked={source === 'openai'} disabled={!!reason} onChange={() => void run(() => setGenerationSource('openai'))} className="mt-0.5 accent-amber-500" />
                <span>
                  <span className="block text-[13px] text-gray-100">My OpenAI plan</span>
                  <span className="block">{reason ?? 'Uses your own ChatGPT plan usage. Your AKS weekly allowance is not touched.'}</span>
                </span>
              </label>
            </fieldset>
          </Accordion>

          <Accordion
            id="chars" title="Saved characters" open={open === 'characters'} onToggle={() => toggle('characters')}
            summary={storage ? `${storage.items}/${storage.maxItems}` : undefined}
          >
            {storage ? (
              <p>{storage.items} of {storage.maxItems} saved · {kb(storage.bytes)} of {kb(storage.maxBytes)} used. Changes save automatically.</p>
            ) : <p>Storage details are unavailable right now.</p>}
            <Button variant="outline" onClick={onOpenLibrary} className="retro game-button mt-3 h-10 w-full text-[10px]">My characters</Button>
          </Accordion>

          <Accordion
            id="conn" title="Connected accounts" open={open === 'connections'} onToggle={() => toggle('connections')}
            summary={data?.connections === null ? 'unavailable' : openai ? (openai.status === 'active' ? 'OpenAI' : 'reconnect') : undefined}
          >
            {data?.connections === null && <p>Connections can’t be loaded right now. Your AKS sign-in is unaffected.</p>}
            {data?.connections && (
              <div className="border-2 border-gray-800 bg-[#141414] p-3">
                <p className="text-[13px] font-bold text-gray-100">OpenAI</p>
                {openai ? (
                  <>
                    <p className="mt-1 break-all">{openai.label} · linked {new Date(openai.linkedAt).toLocaleDateString()}</p>
                    {openai.status === 'reauth_required' && <p className="mt-1 text-amber-400">Needs to be reconnected.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {openai.status === 'reauth_required' && (
                        <Button size="sm" className="game-button h-10 text-[10px]" onClick={() => window.location.assign(data.links.connectOpenai)}>Reconnect</Button>
                      )}
                      {!confirmUnlink ? (
                        <Button size="sm" variant="outline" className="game-button h-10 text-[10px]" disabled={busy} onClick={() => setConfirmUnlink(true)}>Disconnect</Button>
                      ) : (
                        <>
                          <Button size="sm" variant="destructive" className="game-button h-10 text-[10px]" disabled={busy} onClick={() => void run(async () => { await unlinkOpenAI(); setConfirmUnlink(false); return 'OpenAI account disconnected.'; })}>Confirm disconnect</Button>
                          <Button size="sm" variant="outline" className="game-button h-10 text-[10px]" onClick={() => setConfirmUnlink(false)}>Cancel</Button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1">Link your OpenAI (ChatGPT) account to your AKS account. PixelForge gets no access to your ChatGPT conversations, and linking is handled by AKS-CESS, so other AKS apps can use it too.</p>
                    <Button size="sm" className="retro game-button mt-3 h-10 text-[10px]" onClick={() => window.location.assign(data.links.connectOpenai)}>Link OpenAI</Button>
                  </>
                )}
              </div>
            )}
          </Accordion>

          <a
            href={data?.links.manage ?? 'https://auth.aksisonline.com/'}
            target="_blank" rel="noreferrer"
            className="game-interactive flex items-center justify-between border-b border-gray-800 py-3 text-[13px] text-gray-100"
          >
            <span>Manage AKS account</span><ExternalLink size={14} className="text-gray-500" aria-label="opens in a new tab" />
          </a>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">Name, email, password and account deletion are managed on AKS-CESS and apply to every AKS app.</p>
        </section>

        {error && <p role="alert" className="mt-5 border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</p>}
      </section>
    </main>
  );
}

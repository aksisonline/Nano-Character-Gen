import { useCallback, useEffect, useState } from 'react';
import { LogOut, Settings, User } from 'lucide-react';
import { onUsageChange, type UsageInfo } from '../services/geminiService';

export interface Account { loading: boolean; user: { name: string | null; email?: string | null } | null; usage: UsageInfo | null; source: 'aks' | 'openai' }

export function useAccount() {
  const [state, setState] = useState<Account>({ loading: true, user: null, usage: null, source: 'aks' });
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      const data = await res.json();
      setState({ loading: false, user: data.user ?? null, usage: data.usage ?? null, source: data.generationSource === 'openai' ? 'openai' : 'aks' });
    } catch {
      setState({ loading: false, user: null, usage: null, source: 'aks' });
    }
  }, []);
  useEffect(() => {
    onUsageChange((usage) => setState((s) => ({ ...s, usage })));
    void refresh();
  }, [refresh]);
  return { ...state, refresh };
}

export function AccountChip({ account: { user, usage, source }, onOpenAccount, active }: { account: Account; onOpenAccount: () => void; active: boolean }) {
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.reload();
  };
  const low = source === 'aks' && usage && usage.remaining <= 3;
  const [menuOpen, setMenuOpen] = useState(false);
  const usageChip = source === 'openai' ? (
    <span title="Generating with your linked OpenAI plan" className="border border-emerald-800 px-2 py-1 text-emerald-400">OpenAI</span>
  ) : usage && (
    <span
      title={`Resets ${new Date(usage.resetsAt).toLocaleString()}`}
      className={`border px-2 py-1 ${low ? 'border-red-700 text-red-400' : 'border-gray-700 text-gray-400'}`}
    >
      {usage.remaining}/{usage.limit} left
    </span>
  );
  return (
    <>
      <div className="flex items-center gap-2 text-[10px] max-md:hidden">
        {usageChip}
        <button
          type="button"
          onClick={onOpenAccount}
          aria-pressed={active}
          title="Account"
          className={`hidden max-w-28 truncate border px-2 py-1 md:block ${active ? 'border-amber-700 text-amber-400' : 'border-gray-700 text-gray-300 hover:text-gray-100'}`}
        >{user?.name ?? 'Account'}</button>
        <button type="button" onClick={logout} className="border border-gray-700 px-2 py-1 text-gray-400 hover:text-gray-100">Sign out</button>
      </div>
      <div className="relative flex items-center gap-2 text-[10px] md:hidden">
        {usageChip}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          className="game-button game-interactive flex items-center justify-center border border-gray-700 text-gray-300"
        >
          <User size={18} />
        </button>
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="tap-auto fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-48 border-2 border-amber-900/70 bg-[#141414] p-2 text-xs">
              <p className="truncate px-2 py-2 text-gray-400">{user?.name ?? 'AKS account'}</p>
              <button type="button" onClick={() => { setMenuOpen(false); onOpenAccount(); }} className="game-interactive flex w-full items-center gap-2 px-2 text-left text-gray-200">
                <Settings size={16} /> Account
              </button>
              <button type="button" onClick={logout} className="game-interactive flex w-full items-center gap-2 px-2 text-left text-gray-200">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

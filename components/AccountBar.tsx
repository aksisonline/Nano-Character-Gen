import { useCallback, useEffect, useState } from 'react';
import { onUsageChange, type UsageInfo } from '../services/geminiService';

interface Account { loading: boolean; user: { name: string | null } | null; usage: UsageInfo | null }

export function useAccount() {
  const [state, setState] = useState<Account>({ loading: true, user: null, usage: null });
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      const data = await res.json();
      setState({ loading: false, user: data.user ?? null, usage: data.usage ?? null });
    } catch {
      setState({ loading: false, user: null, usage: null });
    }
  }, []);
  useEffect(() => {
    onUsageChange((usage) => setState((s) => ({ ...s, usage })));
    void refresh();
  }, [refresh]);
  return state;
}

export function AccountChip({ account: { user, usage } }: { account: Account }) {
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.reload();
  };
  const low = usage && usage.remaining <= 3;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      {usage && (
        <span
          title={`Resets ${new Date(usage.resetsAt).toLocaleString()}`}
          className={`border px-2 py-1 ${low ? 'border-red-700 text-red-400' : 'border-gray-700 text-gray-400'}`}
        >
          {usage.remaining}/{usage.limit} left
        </span>
      )}
      <span className="hidden max-w-28 truncate text-gray-500 md:block">{user?.name ?? 'AKS account'}</span>
      <button type="button" onClick={logout} className="border border-gray-700 px-2 py-1 text-gray-400 hover:text-gray-100">Sign out</button>
    </div>
  );
}

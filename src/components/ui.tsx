import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { explorer } from '@/lib/chain';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = {
    default: 'bg-zinc-100 text-zinc-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function ProgressBar({ raised, goal }: { raised: bigint; goal: bigint }) {
  const pct = goal > 0n ? Number((raised * 10000n) / goal) / 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass = 'block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200';

export function Button({ children, variant = 'primary', loading, disabled, type = 'button', onClick, className = '' }: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean;
  type?: 'button' | 'submit'; onClick?: () => void; className?: string;
}) {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-700',
    secondary: 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function TxLink({ hash }: { hash?: string }) {
  if (!hash) return null;
  const url = explorer(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline">
      View transaction ↗
    </a>
  ) : null;
}

export function Notice({ status, hash, error }: { status: string; hash?: string; error?: string }) {
  if (status === 'idle') return null;
  if (status === 'error' && error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (status === 'done') return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <span>Confirmed onchain.</span>
      <TxLink hash={hash} />
    </div>
  );
  return (
    <p className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <Spinner />
      {status === 'signing' ? 'Confirm in your wallet…' : 'Waiting for confirmation…'}
      {hash && <TxLink hash={hash} />}
    </p>
  );
}

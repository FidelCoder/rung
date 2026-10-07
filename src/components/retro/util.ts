import { botChain } from '@/lib/chain';
import type { RoundView } from '@/lib/types';

export function sameAddress(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function addressLink(address?: string): string | undefined {
  const base = botChain.blockExplorers?.default.url;
  return base && address ? `${base}/address/${address}` : undefined;
}

/** Human countdown for a unix-second timestamp: "Closed" / "9h left" / "14d left". */
export function remainingLabel(timestamp: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = timestamp - now;
  if (diff <= 0) return 'Closed';
  if (diff < 86400) return `${Math.max(1, Math.floor(diff / 3600))}h left`;
  return `${Math.ceil(diff / 86400)}d left`;
}

/** "just now" / "42m ago" / "3d ago" for a past unix-second timestamp. */
export function agoLabel(timestamp: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = now - timestamp;
  if (diff < 0) return 'just now';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.max(1, Math.floor(diff / 3600))}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Absolute date label. Locale and time zone are pinned so server-rendered HTML
 * matches the client's hydration output on any machine.
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

export type StatusTone = 'default' | 'green' | 'amber' | 'red' | 'blue';

export function roundStatus(round: RoundView, now = Math.floor(Date.now() / 1000)): { label: string; tone: StatusTone } {
  if (round.cancelled) return { label: 'Cancelled', tone: 'red' };
  if (round.finalized) return { label: 'Finalized', tone: 'green' };
  if (now < round.deadline) return { label: 'Open for applications', tone: 'blue' };
  if (now <= round.decisionDeadline) return { label: 'In review', tone: 'amber' };
  return { label: 'Expired — awaiting cancel', tone: 'red' };
}

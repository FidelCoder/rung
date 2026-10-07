import { formatUnits } from 'viem';
export function amount(value: string, decimals = 18) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 3, notation: Number(formatUnits(BigInt(value), decimals)) > 1e6 ? 'compact' : 'standard' }).format(Number(formatUnits(BigInt(value), decimals)));
}
export function short(address: string) { return `${address.slice(0,6)}…${address.slice(-4)}`; }
export function days(timestamp: number) { return Math.max(0, Math.ceil((timestamp - Date.now()/1000)/86400)); }
export function errorMessage(error: unknown) {
  const e = error as { shortMessage?: string; message?: string };
  return e.shortMessage || e.message || 'Something went wrong. Please try again.';
}

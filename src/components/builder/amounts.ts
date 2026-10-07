import { parseUnits } from 'viem';

/** Parse an asset-denominated goal ("12.5") into base units. */
export function parseGoal(value: string, decimals = 18): bigint | undefined {
  const v = value.trim();
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  try {
    const units = parseUnits(v, decimals);
    return units > 0n ? units : undefined;
  } catch {
    return undefined;
  }
}

/** Split a textarea of links (newline or comma separated) into a URL list. */
export function splitLinks(text: string): string[] {
  return text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

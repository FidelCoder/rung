import { safeLink } from '@/lib/metadata';
import type { RoundView } from '@/lib/types';

/**
 * Round rules are pinned with kind `terms`, whose schema is
 * `{title, deliverable, criteria}` — `deliverable` carries the round description
 * and `criteria` the scoring rules. `loadRound` reads `{description, rules}` keys,
 * so when those come back empty we fall back to the terms keys directly.
 */
export async function enrichRound(round: RoundView): Promise<RoundView> {
  if (round.description && round.rules) return round;
  const url = safeLink(round.rulesURI);
  if (!url) return round;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return round;
    const body = (await res.json()) as { deliverable?: string; criteria?: string; description?: string; rules?: string };
    return {
      ...round,
      description: round.description || body.description || body.deliverable || '',
      rules: round.rules || body.rules || body.criteria || '',
    };
  } catch {
    return round;
  }
}

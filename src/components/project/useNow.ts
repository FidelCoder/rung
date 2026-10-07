'use client';

import { useEffect, useState } from 'react';

/** Current epoch milliseconds, hydrated after mount (undefined during SSR) to avoid hydration mismatches. */
export function useNow(intervalMs = 30_000): number | undefined {
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

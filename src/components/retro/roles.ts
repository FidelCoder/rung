'use client';

import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { rungAddress } from '@/lib/chain';
import { rungAbi } from '@/lib/abi';
import { publicClient } from '@/lib/reads';

export type Roles = { owner?: Address };

/** The protocol administrator, read defensively (reverts/preview return empty). */
export async function loadRoles(): Promise<Roles> {
  if (!rungAddress) return {};
  try {
    const owner = await publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'owner' });
    return { owner };
  } catch {
    return {};
  }
}

export function useRoles(): Roles & { rolesLoading: boolean } {
  const [roles, setRoles] = useState<Roles>({});
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (!rungAddress) return;
    let alive = true;
    setRolesLoading(true);
    loadRoles()
      .then(r => { if (alive) setRoles(r); })
      .finally(() => { if (alive) setRolesLoading(false); });
    return () => { alive = false; };
  }, []);

  return { ...roles, rolesLoading };
}

type GraphqlPayload<T> = { data?: T; errors?: { message: string }[] };

const endpoint = () => process.env.INDEXER_URL?.trim();

async function query<T>(source: string): Promise<T | undefined> {
  const url = endpoint();
  if (!url) return undefined;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: source }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as GraphqlPayload<T>;
    return payload.errors?.length ? undefined : payload.data;
  } catch {
    return undefined;
  }
}

/** Discovery ids from Ponder. Contract reads remain the source for displayed state. */
export async function indexedProjectIds(limit: number): Promise<number[] | undefined> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const data = await query<{ projectss?: { items?: { id: string }[] } }>(
    `{ projectss(limit: ${safeLimit}, orderBy: \"id\", orderDirection: \"desc\") { items { id } } }`,
  );
  const rows = data?.projectss?.items;
  if (!rows) return undefined;
  return rows
    .map(row => Number(row.id))
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => b - a);
}

/** Registry-created round addresses from Ponder. */
export async function indexedRoundAddresses(): Promise<`0x${string}`[] | undefined> {
  const data = await query<{ roundss?: { items?: { address: string }[] } }>(
    '{ roundss(limit: 500, orderBy: "roundId", orderDirection: "desc") { items { address } } }',
  );
  const rows = data?.roundss?.items;
  if (!rows) return undefined;
  return rows.map(row => row.address as `0x${string}`);
}

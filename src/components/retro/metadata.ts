export type PinnedMetadata = { uri: string; hash: string };

/**
 * POST to the existing /api/metadata endpoint. Kinds are fixed by the API:
 * `terms` (round rules / stage terms), `application` (retro application evidence),
 * `award` (reviewer scoring receipt).
 */
export async function postMetadata(kind: 'terms' | 'application' | 'award', data: unknown): Promise<PinnedMetadata> {
  const res = await fetch('/api/metadata', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, data }),
  });
  const body = (await res.json().catch(() => ({}))) as { uri?: string; hash?: string; error?: string };
  if (!res.ok || !body.uri || !body.hash) throw new Error(body.error || 'Metadata upload failed.');
  return { uri: body.uri, hash: body.hash };
}

export type PinKind = 'project' | 'terms' | 'evidence';
export type PinnedMeta = { uri: string; hash: string };

type PinResponse = {
  uri?: string;
  hash?: string;
  error?: string;
  issues?: { path: (string | number)[]; message: string }[];
};

/** POST /api/metadata — server validates with the zod schema and pins the content. */
export async function pinMetadata(kind: PinKind, data: unknown): Promise<PinnedMeta> {
  let res: Response;
  try {
    res = await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, data }),
    });
  } catch {
    throw new Error('Could not reach the metadata service. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => ({}))) as PinResponse;
  if (!res.ok || !body.uri || !body.hash) {
    const first = body.issues?.[0];
    const where = first?.path.join('.') || 'form';
    throw new Error(first ? `${where}: ${first.message}` : body.error || `Metadata upload failed (${res.status}).`);
  }
  return { uri: body.uri, hash: body.hash };
}

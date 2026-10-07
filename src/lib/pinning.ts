import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { keccak256, toBytes } from 'viem';

export type Pinned = { uri: string; hash: string };

const LOCAL_DIR = path.join(process.cwd(), '.data', 'metadata');

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Replaceable pinning adapter. When PINNING_ENDPOINT is configured, content is
 * pushed to a Pinning-Service-API-compatible endpoint; otherwise content is
 * stored locally and served from /api/metadata/[hash] during development or
 * explicitly enabled localhost testing.
 * Either way the caller receives a content URI and a keccak256 content hash to
 * record onchain.
 */
export async function pinJson(kind: string, data: unknown): Promise<Pinned> {
  const content = JSON.stringify({ kind, ...(typeof data === 'object' && data !== null ? data : { value: data }) });
  const hash = keccak256(toBytes(content));
  const endpoint = process.env.PINNING_ENDPOINT;
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.PINNING_TOKEN ? { authorization: `Bearer ${process.env.PINNING_TOKEN}` } : {}),
      },
      body: JSON.stringify({ content, name: `rung-${kind}` }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Pinning service failed with ${res.status}`);
    const body = (await res.json()) as { uri?: string };
    if (!body.uri) throw new Error('Pinning service did not return a uri');
    return { uri: body.uri, hash };
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (process.env.NODE_ENV === 'production' && (
    process.env.ALLOW_LOCAL_METADATA !== 'true' || !isLoopbackOrigin(base)
  )) {
    throw new Error('Configure PINNING_ENDPOINT for durable metadata, or enable local metadata for a localhost-only test.');
  }
  const id = createHash('sha256').update(content).digest('hex').slice(0, 40);
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, `${id}.json`), content);
  return { uri: `${base}/api/metadata/${id}`, hash };
}

export async function readLocal(id: string): Promise<unknown | undefined> {
  if (!/^[a-f0-9]{6,64}$/.test(id)) return undefined;
  try {
    return JSON.parse(await readFile(path.join(LOCAL_DIR, `${id}.json`), 'utf8'));
  } catch { return undefined; }
}

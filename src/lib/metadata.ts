import { z } from 'zod';
export const projectSchema = z.object({
  name: z.string().trim().min(3).max(60), description: z.string().trim().min(20).max(600),
  category: z.enum(['Developer tools', 'AI & agents', 'DePIN', 'Public goods']),
  website: z.string().url().refine(v => v.startsWith('https://'), 'Use an HTTPS link').optional().or(z.literal('')),
});
export const termsSchema = z.object({ title: z.string().trim().min(5).max(100), deliverable: z.string().trim().min(20).max(1000), criteria: z.string().trim().min(20).max(1000) });
export const evidenceSchema = z.object({
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(20).max(2000),
  links: z.array(z.string().url()).max(10).default([]),
  artifacts: z.array(z.string().url()).max(10).default([]),
});
export const applicationSchema = z.object({
  outcomes: z.string().trim().min(20).max(2000),
  metrics: z.array(z.object({ label: z.string().trim().min(2).max(80), value: z.string().trim().min(1).max(80) })).max(8).default([]),
  evidenceLinks: z.array(z.string().url()).max(10).default([]),
});
export const awardSchema = z.object({
  score: z.number().int().min(0).max(100),
  rationale: z.string().trim().min(10).max(1000),
  criteria: z.array(z.object({ label: z.string().trim().min(2).max(80), weight: z.number().min(0).max(100) })).min(1).max(10),
});
export type EvidenceMetadata = z.infer<typeof evidenceSchema>;
export type ApplicationMetadata = z.infer<typeof applicationSchema>;
export type AwardMetadata = z.infer<typeof awardSchema>;

export function safeLink(uri: string): string | undefined {
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:') return url.href;
    // Local pinning adapter serves metadata over plain HTTP on loopback.
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return url.href;
    return undefined;
  } catch { return undefined; }
}

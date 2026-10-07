import { NextResponse } from 'next/server';
import { applicationSchema, awardSchema, evidenceSchema, projectSchema, termsSchema } from '@/lib/metadata';
import { pinJson } from '@/lib/pinning';

const schemas = {
  project: projectSchema,
  terms: termsSchema,
  evidence: evidenceSchema,
  application: applicationSchema,
  award: awardSchema,
} as const;

export async function POST(request: Request) {
  let body: { kind?: string; data?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const kind = body.kind as keyof typeof schemas | undefined;
  if (!kind || !(kind in schemas)) {
    return NextResponse.json({ error: `kind must be one of: ${Object.keys(schemas).join(', ')}` }, { status: 400 });
  }
  const parsed = schemas[kind].safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }
  try {
    const pinned = await pinJson(kind, parsed.data);
    return NextResponse.json(pinned);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Pinning failed' }, { status: 502 });
  }
}

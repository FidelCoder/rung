import { NextResponse } from 'next/server';
import { readLocal } from '@/lib/pinning';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const content = await readLocal(id);
  if (content === undefined) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(content, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
}

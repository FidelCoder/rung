import { NextResponse } from 'next/server';
import { loadDiscoveredProjects } from '@/lib/discovery.server';
import { preview } from '@/lib/chain';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 100) || 100, 500);
  try {
    const projects = await loadDiscoveredProjects(limit);
    return NextResponse.json({ projects, source: projects[0]?.source ?? (preview ? 'preview' : 'chain') });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load projects' }, { status: 502 });
  }
}

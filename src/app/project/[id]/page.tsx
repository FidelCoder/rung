import Link from 'next/link';
import { loadProject } from '@/lib/reads';
import { ProjectDetail } from '@/components/project/ProjectDetail';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = Number(id);
  const project = Number.isInteger(parsedId) ? await loadProject(parsedId) : undefined;

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project #{id}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Project not found</h1>
        <p className="max-w-md text-sm leading-6 text-zinc-600">
          This project does not exist on this chain yet, or the id you followed is no longer valid.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Back to projects
        </Link>
      </div>
    );
  }

  return <ProjectDetail project={project} />;
}

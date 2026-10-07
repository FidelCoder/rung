import type { Metadata } from 'next';
import Link from 'next/link';
import { WorkspaceClient } from './WorkspaceClient';

export const metadata: Metadata = {
  title: 'Workspace — Rung',
  description: 'Manage your projects: open stages, claim funds, submit evidence, and track community votes.',
};

export default function WorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Builder workspace</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your projects, their latest escrow, and every builder action: open the next stage, claim, cancel, submit evidence, and respond to community feedback.
          </p>
        </div>
        <Link
          href="/new"
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Start a project
        </Link>
      </div>
      <WorkspaceClient />
    </div>
  );
}

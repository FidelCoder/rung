import type { Metadata } from 'next';
import Link from 'next/link';
import { NewProjectForm } from './NewProjectForm';

export const metadata: Metadata = {
  title: 'Start a project — Rung',
  description: 'Create a project and open its first funding stage on BOT Chain.',
};

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Start a project</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Describe the project, define the first stage&apos;s terms, then publish both onchain. You will sign two transactions.
          </p>
        </div>
        <Link href="/workspace" className="text-sm text-blue-600 hover:underline">
          Already building? Open your workspace
        </Link>
      </div>
      <NewProjectForm />
    </div>
  );
}

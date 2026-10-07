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
            Describe the project, set its first stage, then publish on Bohr Testnet. You will confirm two transactions and pay their network fees in BOT; the stage goal is not charged at launch.
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

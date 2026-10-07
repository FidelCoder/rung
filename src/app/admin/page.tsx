import type { Metadata } from 'next';
import { AdminPanel } from './AdminPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Rung',
  description: 'Protocol admin controls for shared safety settings.',
};

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Protocol settings</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
          Shared platform safety settings: the campaign asset allowlist and creation pause.
          Project decisions belong to contributing communities; each organization manages its
          own round reviewers. Pausing only blocks new projects, stages, and rounds.
        </p>
      </header>
      <AdminPanel />
    </div>
  );
}

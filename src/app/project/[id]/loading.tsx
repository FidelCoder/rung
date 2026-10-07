import { Spinner } from '@/components/ui';

export default function ProjectLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-4 rounded-3xl bg-zinc-900 px-6 py-8 sm:px-10 sm:py-10">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-700" />
        <div className="h-8 w-72 animate-pulse rounded bg-zinc-700" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-2/3 max-w-lg animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-56 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-100" />
        <div className="h-2 w-full animate-pulse rounded-full bg-zinc-100" />
      </div>
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading project…
      </div>
    </div>
  );
}

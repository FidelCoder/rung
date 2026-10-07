'use client';

import type { ReactNode } from 'react';

export function PreviewRolePicker<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: string }[];
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Preview as</span>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            value === option.value ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          {option.label}
        </button>
      ))}
      <span className="text-xs text-amber-700">Transactions are disabled in preview mode.</span>
    </div>
  );
}

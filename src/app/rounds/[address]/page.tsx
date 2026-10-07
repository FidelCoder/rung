import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAddress, type Address } from 'viem';
import { preview } from '@/lib/chain';
import { loadRound } from '@/lib/reads';
import { enrichRound } from '@/components/retro/roundRules';
import { sampleRound } from '@/components/retro/previewData';
import { RoundDetail } from '@/components/retro/RoundDetail';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Round — Rung',
  description: 'Retro round rules, applications, awards, and claims.',
};

export default async function RoundDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();

  // Preview has no deployed round contract: render a sample round for any valid address.
  const round = preview ? sampleRound(address as Address) : await loadRound(address as Address);
  if (!round) notFound();

  return <RoundDetail round={await enrichRound(round)} />;
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useConnection } from 'wagmi';
import { isAddress, zeroAddress, type Address } from 'viem';
import { rungAbi } from '@/lib/abi';
import { preview, rungAddress } from '@/lib/chain';
import { publicClient } from '@/lib/reads';
import { useTx } from '@/lib/tx';
import { useRoles } from '@/components/retro/roles';
import { previewOwner } from '@/components/retro/previewData';
import { Badge, Button, Card, Field, Notice, Spinner, inputClass } from '@/components/ui';

type AssetRow = { address: Address; allowed: boolean };

async function loadAllowlist(): Promise<AssetRow[]> {
  // Native BOT is enabled at deployment and lives at address(0).
  const rows: AssetRow[] = [{ address: zeroAddress, allowed: true }];
  if (!rungAddress) return rows;
  try {
    const seen = new Set<string>([zeroAddress]);
    const [stageLogs, roundLogs, allowlistLogs] = await Promise.all([
      publicClient.getLogs({
        address: rungAddress,
        event: {
          type: 'event',
          name: 'StageCreated',
          inputs: [
            { name: 'projectId', type: 'uint256', indexed: true },
            { name: 'stageNumber', type: 'uint256', indexed: true },
            { name: 'stage', type: 'address', indexed: true },
            { name: 'builder', type: 'address', indexed: false },
            { name: 'asset', type: 'address', indexed: false },
            { name: 'goal', type: 'uint256', indexed: false },
            { name: 'deadline', type: 'uint64', indexed: false },
          ],
        },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicClient.getLogs({
        address: rungAddress,
        event: {
          type: 'event',
          name: 'RoundCreated',
          inputs: [
            { name: 'roundId', type: 'uint256', indexed: true },
            { name: 'round', type: 'address', indexed: true },
            { name: 'asset', type: 'address', indexed: false },
            { name: 'budget', type: 'uint256', indexed: false },
          ],
        },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicClient.getLogs({
        address: rungAddress,
        event: {
          type: 'event',
          name: 'AssetAllowed',
          inputs: [
            { name: 'asset', type: 'address', indexed: true },
            { name: 'allowed', type: 'bool', indexed: false },
          ],
        },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ]);
    const assets = new Set<string>();
    for (const log of [...stageLogs, ...roundLogs, ...allowlistLogs]) {
      const asset = (log.args as { asset?: Address }).asset;
      if (asset) assets.add(asset.toLowerCase());
    }
    const checks = await Promise.all([...assets].map(async lower => {
      const address = lower as Address;
      try {
        const allowed = await publicClient.readContract({ address: rungAddress!, abi: rungAbi, functionName: 'allowedAsset', args: [address] });
        return { address, allowed };
      } catch {
        return { address, allowed: false };
      }
    }));
    rows.push(...checks.filter(r => !seen.has(r.address)));
  } catch { /* no deployment / RPC error — native row only */ }
  return rows;
}

export function AdminPanel() {
  const { address } = useConnection();
  const { owner, rolesLoading } = useRoles();
  const assetTx = useTx();
  const pauseTx = useTx();

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [newAsset, setNewAsset] = useState('');
  const [assetError, setAssetError] = useState<string>();
  const [paused, setPaused] = useState<boolean>();
  const [pauseError, setPauseError] = useState<string>();

  const effectiveOwner = preview ? previewOwner : owner;
  const isOwner = preview || (!!address && !!effectiveOwner && address.toLowerCase() === effectiveOwner.toLowerCase());

  useEffect(() => {
    if (!rungAddress) { setAssets([{ address: zeroAddress, allowed: true }]); return; }
    let alive = true;
    setAssetsLoading(true);
    loadAllowlist()
      .then(rows => { if (alive) setAssets(rows); })
      .finally(() => { if (alive) setAssetsLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!rungAddress) { setPaused(false); return; }
    let alive = true;
    publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'creationPaused' })
      .then(v => { if (alive) setPaused(v); })
      .catch(() => { if (alive) setPaused(undefined); });
    return () => { alive = false; };
  }, [assetTx.status, pauseTx.status]);

  const refreshAssets = () => {
    if (!rungAddress) return;
    setAssetsLoading(true);
    loadAllowlist().then(setAssets).finally(() => setAssetsLoading(false));
  };

  async function submitAsset(e: FormEvent) {
    e.preventDefault();
    setAssetError(undefined);
    if (!isAddress(newAsset)) { setAssetError('Enter a valid contract address.'); return; }
    if (newAsset.toLowerCase() === zeroAddress) { setAssetError('Native BOT is always allowed.'); return; }
    if (!rungAddress) { setAssetError('No contract address configured — preview mode cannot send transactions.'); return; }
    const hash = await assetTx.send({ address: rungAddress, abi: rungAbi, functionName: 'setAssetAllowed', args: [newAsset as Address, true] });
    if (hash) { setNewAsset(''); refreshAssets(); }
  }

  async function revoke(asset: Address) {
    if (!rungAddress) return;
    const hash = await assetTx.send({ address: rungAddress, abi: rungAbi, functionName: 'setAssetAllowed', args: [asset, false] });
    if (hash) refreshAssets();
  }

  async function togglePause() {
    setPauseError(undefined);
    if (!rungAddress) { setPauseError('No contract address configured — preview mode cannot send transactions.'); return; }
    const next = !paused;
    const hash = await pauseTx.send({ address: rungAddress, abi: rungAbi, functionName: 'setCreationPaused', args: [next] });
    if (hash) setPaused(next);
  }

  if (rolesLoading && !preview) {
    return <Card className="flex items-center gap-2 text-sm text-zinc-600"><Spinner /> Reading protocol admin…</Card>;
  }

  return (
    <div className="space-y-6">
      {preview && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Preview mode — no contract address configured. Protocol settings below are samples.
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Protocol administration</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Controls shared asset safety settings and pauses new creation. Project and round decisions belong to their communities and organizations.</p>
          </div>
          {!isOwner && !preview && <Badge tone="amber">Read-only — connect the owner wallet</Badge>}
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {([['Protocol admin', effectiveOwner]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-zinc-50 p-3">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="mt-1 break-all font-mono text-xs text-zinc-900">{value || '—'}</dd>
            </div>
          ))}
        </dl>

      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Asset allowlist</h2>
            <p className="mt-0.05 text-xs text-zinc-500">
              Native BOT is always enabled. ERC-20s require a verified contract — confirm symbol and decimals before allowlisting.
            </p>
          </div>
          <Button variant="secondary" onClick={refreshAssets} disabled={assetsLoading}>Refresh</Button>
        </div>
        {assetsLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading allowlist…</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {assets.map(row => (
              <li key={row.address} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3.5 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="break-all font-mono text-xs text-zinc-800">
                    {row.address === zeroAddress ? 'Native BOT (address(0))' : row.address}
                  </span>
                  <Badge tone={row.allowed ? 'green' : 'red'}>{row.allowed ? 'Allowed' : 'Revoked'}</Badge>
                </span>
                {row.address !== zeroAddress && row.allowed && (
                  <Button variant="danger" onClick={() => void revoke(row.address)} disabled={!isOwner || assetTx.pending}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submitAsset} className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
          <Field label="Allow an ERC-20 asset" hint="Contract address only — tokens without code are rejected by the registry.">
            <input className={inputClass} value={newAsset} onChange={e => setNewAsset(e.target.value)} placeholder="0x…" />
          </Field>
          {assetError && <p className="text-xs text-red-600">{assetError}</p>}
          <Notice status={assetTx.status} hash={assetTx.hash} error={assetTx.error} />
          <Button type="submit" loading={assetTx.pending} disabled={!isOwner}>Allow asset</Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold">Creation pause</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Pausing blocks new projects, stages, and rounds only. Claims, refunds, and community votes are never blocked.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-zinc-700">
            Status:
            {paused === undefined ? <Spinner /> : <Badge tone={paused ? 'red' : 'green'}>{paused ? 'Creation paused' : 'Creation open'}</Badge>}
          </span>
          <Button
            variant={paused ? 'primary' : 'danger'}
            onClick={() => void togglePause()}
            loading={pauseTx.pending}
            disabled={!isOwner || paused === undefined}
          >
            {paused ? 'Resume creation' : 'Pause creation'}
          </Button>
        </div>
        <div className="mt-3">
          <Notice status={pauseTx.status} hash={pauseTx.hash} error={pauseTx.error} />
          {pauseError && <p className="text-xs text-red-600">{pauseError}</p>}
        </div>
      </Card>
    </div>
  );
}

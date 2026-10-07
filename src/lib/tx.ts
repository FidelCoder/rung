'use client';

import { useCallback, useState } from 'react';
import { useConnection, usePublicClient, useWriteContract } from 'wagmi';
import type { Abi, Address, Hash } from 'viem';
import { errorMessage } from './format';
import { botChain } from './chain';

export type TxRequest = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export type TxStatus = 'idle' | 'signing' | 'confirming' | 'done' | 'error';

export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { chainId: connectedChainId } = useConnection();
  const [status, setStatus] = useState<TxStatus>('idle');
  const [hash, setHash] = useState<Hash | undefined>();
  const [error, setError] = useState<string | undefined>();

  const send = useCallback(async (tx: TxRequest, opts?: { onConfirm?: () => void }) => {
    setStatus('signing');
    setError(undefined);
    try {
      if (connectedChainId !== botChain.id) {
        throw new Error(`Your wallet is on chain ${connectedChainId ?? 'unknown'}. Switch to ${botChain.name} (chain ${botChain.id}) before sending. Network fees are paid in ${botChain.nativeCurrency.symbol}.`);
      }
      const h = await writeContractAsync({ ...tx, chainId: botChain.id } as never);
      setHash(h);
      setStatus('confirming');
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== 'success') throw new Error('Transaction reverted onchain.');
      setStatus('done');
      opts?.onConfirm?.();
      return h;
    } catch (e) {
      setError(errorMessage(e));
      setStatus('error');
      return undefined;
    }
  }, [connectedChainId, writeContractAsync, publicClient]);

  const reset = useCallback(() => { setStatus('idle'); setHash(undefined); setError(undefined); }, []);
  const pending = status === 'signing' || status === 'confirming';
  return { send, status, hash, error, reset, pending };
}

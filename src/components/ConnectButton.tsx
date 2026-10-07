'use client';

import { Plug, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConnect, useConnection, useDisconnect, useSwitchChain } from 'wagmi';
import { errorMessage, short } from '@/lib/format';
import { botChain } from '@/lib/chain';

const targetNetworkLabel = botChain.id === 968 ? 'Bohr Testnet' : botChain.name;

export function ConnectButton() {
  const { connect, connectors, isPending } = useConnect();
  const { address, status, chainId } = useConnection();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchPending, error: switchError } = useSwitchChain();
  const [open, setOpen] = useState(false);
  // Wallet state is client-only; wait for mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="wallet-placeholder">Connect wallet</span>;
  }

  if (address) {
    const onAppChain = chainId === botChain.id;
    return (
      <div className="wallet-status">
        <div className="wallet-menu">
          <button
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className="wallet-trigger"
          >
            <Wallet className="h-4 w-4" />
            {short(address)}
          </button>
          {open && (
            <>
              <div className="wallet-backdrop" onClick={() => setOpen(false)} />
              <div className="wallet-dropdown">
                <p className="wallet-account-network">
                  {onAppChain ? `${targetNetworkLabel} · ${botChain.nativeCurrency.symbol}` : `Connected to chain ${chainId ?? 'unknown'}`}
                </p>
                <button
                  onClick={() => { disconnect(); setOpen(false); }}
                  className="wallet-disconnect"
                >
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>
        {onAppChain ? (
          <span className="wallet-network-ok">{targetNetworkLabel} · {botChain.nativeCurrency.symbol}</span>
        ) : (
          <button
            type="button"
            className="wallet-switch"
            disabled={isSwitchPending}
            onClick={() => switchChain({ chainId: botChain.id })}
          >
            {isSwitchPending ? 'Switching…' : `Switch to ${targetNetworkLabel}`}
          </button>
        )}
        {switchError && <span className="wallet-switch-error">{errorMessage(switchError)}</span>}
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <button
      disabled={isPending || status === 'connecting' || !connector}
      onClick={() => connector && connect({ connector, chainId: botChain.id })}
      className="wallet-button"
    >
      <Plug className="h-4 w-4" />
      <span>{isPending || status === 'connecting' ? 'Connecting…' : `Connect to ${targetNetworkLabel}`}</span>
    </button>
  );
}

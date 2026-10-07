'use client';

import { useEffect, useState } from 'react';
import { erc20Abi, isAddress, zeroAddress, type Address } from 'viem';
import { rungAbi } from '@/lib/abi';
import { rungAddress } from '@/lib/chain';
import { publicClient } from '@/lib/reads';
import { Field, inputClass } from '@/components/ui';

export type AssetChoice = {
  address: Address | undefined;
  addressInput: string;
  setAddressInput: (value: string) => void;
  symbol: string;
  decimals: number;
  valid: boolean;
  loading: boolean;
  error?: string;
};

export function useAssetChoice(initial = zeroAddress): AssetChoice {
  const [addressInput, setAddressInput] = useState<string>(initial);
  const [token, setToken] = useState<{ address: Address; symbol: string; decimals: number }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    setToken(undefined);
    setError(undefined);

    if (addressInput.toLowerCase() === zeroAddress) {
      setLoading(false);
      return () => { alive = false; };
    }
    if (!isAddress(addressInput)) {
      setLoading(false);
      if (addressInput.trim()) setError('Enter a valid ERC-20 contract address.');
      return () => { alive = false; };
    }
    if (!rungAddress) {
      setLoading(false);
      setError('Configure the Rung registry before selecting an ERC-20 asset.');
      return () => { alive = false; };
    }

    const address = addressInput as Address;
    setLoading(true);
    void Promise.all([
      publicClient.readContract({ address: rungAddress, abi: rungAbi, functionName: 'allowedAsset', args: [address] }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    ]).then(([allowed, symbol, decimals]) => {
      if (!alive) return;
      if (!allowed) {
        setError('This token is not allowlisted by the Rung registry.');
        return;
      }
      setToken({ address, symbol, decimals: Number(decimals) });
    }).catch(() => {
      if (alive) setError('Could not read this token. Check the address and network.');
    }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [addressInput]);

  const native = addressInput.toLowerCase() === zeroAddress;
  const validAddress = native || isAddress(addressInput);
  const valid = native || (!!token && !error);

  return {
    address: native ? zeroAddress : token?.address,
    addressInput,
    setAddressInput,
    symbol: native ? 'BOT' : token?.symbol ?? 'TOKEN',
    decimals: native ? 18 : token?.decimals ?? 18,
    valid: validAddress && valid,
    loading,
    error,
  };
}

export function AssetPicker({ choice, label = 'Funding asset', error }: { choice: AssetChoice; label?: string; error?: string }) {
  const native = choice.addressInput.toLowerCase() === zeroAddress;
  return (
    <Field
      label={label}
      error={error || choice.error}
      hint={native ? 'Native BOT is always enabled.' : choice.loading ? 'Checking registry allowlist and token metadata…' : choice.valid ? `${choice.symbol} · ${choice.decimals} decimals` : 'Choose an allowlisted ERC-20 token.'}
    >
      <div className="space-y-2">
        <select
          className={inputClass}
          value={native ? 'native' : 'token'}
          onChange={event => choice.setAddressInput(event.target.value === 'native' ? zeroAddress : '')}
        >
          <option value="native">Native BOT</option>
          <option value="token">Allowlisted ERC-20</option>
        </select>
        {!native && (
          <input
            className={inputClass}
            value={choice.addressInput}
            onChange={event => choice.setAddressInput(event.target.value.trim())}
            placeholder="Token contract address (0x…)"
            inputMode="text"
            autoComplete="off"
          />
        )}
      </div>
    </Field>
  );
}

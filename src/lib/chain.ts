import { defineChain, isAddress, zeroAddress, type Address } from 'viem';

// The app is currently deployed against Bohr Testnet. Fall back to testnet so
// a missing local env file can never send a builder toward the mainnet wallet.
const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 968);
const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.bohr.life';
export const botChain = defineChain({
  id, name: id === 31337 ? 'Local BOT' : id === 677 ? 'BOT Chain' : id === 968 ? 'Bohr Testnet (BOT Chain)' : 'BOT Network',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
  blockExplorers: id === 677
    ? { default: { name: 'BOT Scan', url: 'https://scan.botchain.ai' } }
    : id === 968
      ? { default: { name: 'Bohr Scan', url: 'https://scan.bohr.life' } }
      : undefined,
});
const configured = process.env.NEXT_PUBLIC_RUNG_ADDRESS;
export const rungAddress: Address | undefined = configured && isAddress(configured) && configured !== zeroAddress ? configured : undefined;
export const preview = !rungAddress;
/** Block the Rung registry was deployed at — used to bound log scans. 0 scans from genesis. */
const deployBlockRaw = Number(process.env.NEXT_PUBLIC_RUNG_DEPLOY_BLOCK || '0');
export const rungDeployBlock: bigint = Number.isFinite(deployBlockRaw) && deployBlockRaw > 0 ? BigInt(deployBlockRaw) : 0n;
export function explorer(hash: string) { return botChain.blockExplorers?.default.url ? `${botChain.blockExplorers.default.url}/tx/${hash}` : undefined; }
export const nativeAsset = { address: zeroAddress, symbol: 'BOT', decimals: 18 };

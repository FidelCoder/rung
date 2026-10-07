import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { botChain } from './chain';

const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.bohr.life';

export const wagmiConfig = createConfig({
  chains: [botChain],
  connectors: [injected()],
  transports: { [botChain.id]: http(rpc) },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}

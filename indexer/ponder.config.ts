import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import { retroRoundAbi } from "../src/lib/abi/RetroRound";
import { rungAbi } from "../src/lib/abi/Rung";
import { stageEscrowAbi } from "../src/lib/abi/StageEscrow";

/**
 * Rung indexer configuration (BOT Chain mainnet 677 or Bohr testnet 968).
 *
 * Env:
 * - RUNG_ADDRESS       deployed Rung registry. When unset, a zero address
 *                      placeholder is used so the project still boots; no logs
 *                      will match until it is set (see indexer/README.md).
 * - RUNG_DEPLOY_BLOCK  block the Rung registry was deployed at (default 0).
 * - PONDER_CHAIN_ID     chain id (default 968 for Bohr testnet).
 * - PONDER_RPC_URL_968  testnet RPC endpoint (default https://rpc.bohr.life).
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const rungAddress = (process.env.RUNG_ADDRESS || ZERO_ADDRESS) as `0x${string}`;
const chainId = Number.parseInt(process.env.PONDER_CHAIN_ID || "968", 10);
const defaultRpc = chainId === 677 ? "https://rpc.botchain.ai" : "https://rpc.bohr.life";
const rpc = process.env[`PONDER_RPC_URL_${chainId}`] || process.env.PONDER_RPC_URL || defaultRpc;

const deployBlock = Number.parseInt(process.env.RUNG_DEPLOY_BLOCK ?? "0", 10);
const startBlock = Number.isFinite(deployBlock) && deployBlock > 0 ? deployBlock : 0;

const stageCreatedEvent = parseAbiItem(
  "event StageCreated(uint256 indexed projectId, uint256 indexed stageNumber, address indexed stage, address builder, address asset, uint256 goal, uint64 deadline)",
);

const roundCreatedEvent = parseAbiItem(
  "event RoundCreated(uint256 indexed roundId, address indexed round, address indexed creator, address reviewer, address asset, uint256 budget)",
);

export default createConfig({
  chains: {
    bot: {
      id: chainId,
      rpc,
    },
  },
  contracts: {
    Rung: {
      abi: rungAbi,
      chain: "bot",
      address: rungAddress,
      startBlock,
    },
    // StageEscrow instances are deployed per project stage by Rung; their
    // addresses are discovered from the StageCreated event's `stage` param.
    StageEscrow: {
      abi: stageEscrowAbi,
      chain: "bot",
      address: factory({
        address: rungAddress,
        event: stageCreatedEvent,
        parameter: "stage",
        startBlock,
      }),
      startBlock,
    },
    // RetroRound instances are deployed by Rung; their addresses are
    // discovered from the RoundCreated event's `round` param.
    RetroRound: {
      abi: retroRoundAbi,
      chain: "bot",
      address: factory({
        address: rungAddress,
        event: roundCreatedEvent,
        parameter: "round",
        startBlock,
      }),
      startBlock,
    },
  },
});

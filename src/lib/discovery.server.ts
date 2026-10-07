import { preview, rungAddress } from './chain';
import { indexedProjectIds, indexedRoundAddresses } from './indexer.server';
import { loadProject, loadProjects, loadRound, loadRounds } from './reads';
import type { ProjectView, RoundView } from './types';

/** Prefer indexed discovery, then read current financial/project state from chain. */
export async function loadDiscoveredProjects(limit = 100): Promise<ProjectView[]> {
  if (preview || !rungAddress) return loadProjects(limit);
  const ids = await indexedProjectIds(limit);
  if (!ids?.length) return loadProjects(limit);
  const projects = await Promise.all(ids.map(id => loadProject(id)));
  return projects.filter((project): project is ProjectView => !!project);
}

/** Prefer indexed round addresses, with direct registry enumeration as fallback. */
export async function loadDiscoveredRounds(): Promise<RoundView[]> {
  if (preview || !rungAddress) return loadRounds();
  const addresses = await indexedRoundAddresses();
  if (!addresses?.length) return loadRounds();
  const rounds = await Promise.all(addresses.map(address => loadRound(address)));
  return rounds.filter((round): round is RoundView => !!round);
}

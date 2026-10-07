import type { ProjectView } from './types';
import { loadProjects } from './reads';

export async function fetchProjects(limit = 100): Promise<ProjectView[]> {
  try {
    const response = await fetch(`/api/projects?limit=${Math.max(1, Math.min(500, limit))}`, {
      cache: 'no-store',
    });
    if (!response.ok) return loadProjects(limit);
    const payload = await response.json() as { projects?: ProjectView[] };
    return payload.projects ?? loadProjects(limit);
  } catch {
    return loadProjects(limit);
  }
}

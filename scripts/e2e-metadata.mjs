// Writes project + stage-terms metadata exactly like src/lib/pinning.ts does in
// local mode, so the E2E seed can reference URIs the app can really serve.
// Prints shell-exportable lines: PROJECT_URI=... TERMS_URI=...
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3111';
const dir = path.join(process.cwd(), '.data', 'metadata');

function pin(kind, data) {
  const content = JSON.stringify({ kind, ...data });
  const id = createHash('sha256').update(content).digest('hex').slice(0, 40);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.json`), content);
  return `${base}/api/metadata/${id}`;
}

const projectUri = pin('project', {
  name: 'OpenKit',
  description: 'An open-source toolkit that helps developers ship their first BOT Chain integration in an afternoon.',
  category: 'Developer tools',
});
const termsUri = pin('terms', {
  title: 'Ship the transaction toolkit',
  deliverable: 'Publish a TypeScript package with wallet connection, transaction simulation, and receipt tracking.',
  criteria: 'A public repository, published package, and two independent apps demonstrating the integration.',
});

console.log(`PROJECT_URI=${projectUri}`);
console.log(`TERMS_URI=${termsUri}`);

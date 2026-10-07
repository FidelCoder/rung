// Web smoke test: boots the production build and checks every route renders
// without console/page errors, in preview mode (no contract configured).
// Usage: pnpm build && pnpm test:web   (BASE_URL=http://host:port to test a running server)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:3111';
const external = !!process.env.BASE_URL;

const routes = [
  ['/', 'Projects'],
  ['/new', ''],
  ['/workspace', ''],
  ['/review', ''],
  ['/admin', ''],
  ['/rounds', ''],
  ['/project/1', ''],
  ['/api/projects', ''],
];

let server;
async function startServer() {
  if (external) return;
  if (!existsSync(path.join(root, '.next'))) {
    console.error('No .next build found — run `pnpm build` first.');
    process.exit(1);
  }
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  server = spawn(process.execPath, [nextBin, 'start', '--port', '3111'], { cwd: root, stdio: 'pipe' });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/metadata/x', { signal: AbortSignal.timeout(2000) });
      if (res.status === 404) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server did not start within 60s');
}

const failures = [];
const browser = await chromium.launch();
try {
  await startServer();
  for (const [route, expectText] of routes) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => {
      // favicon noise is not a product error
      if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(String(err)));
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30_000 });
      const status = res?.status() ?? 0;
      if (status >= 500) failures.push(`${route}: HTTP ${status}`);
      else if (status >= 400 && !route.startsWith('/project/999')) failures.push(`${route}: HTTP ${status}`);
      if (route.startsWith('/api/')) {
        const body = await page.textContent('body');
        if (!body?.includes('projects')) failures.push(`${route}: unexpected body`);
      } else {
        if (expectText) {
          const body = await page.textContent('body');
          if (!body?.includes(expectText)) failures.push(`${route}: missing "${expectText}"`);
        }
        if (errors.length) failures.push(`${route}: console errors → ${errors.join(' | ')}`);
      }
      console.log(`${status < 400 ? 'PASS' : 'FAIL'} ${route} (${status})`);
    } catch (e) {
      failures.push(`${route}: ${e.message}`);
      console.log(`FAIL ${route}: ${e.message}`);
    }
    await page.close();
  }
  // 404 behaviour
  const page = await browser.newPage();
  await page.goto(BASE + '/project/999999', { waitUntil: 'networkidle', timeout: 30_000 });
  const body = (await page.textContent('body')) || '';
  if (!/not found|no project|home/i.test(body)) failures.push('/project/999999: expected not-found UI');
  else console.log('PASS /project/999999 (not-found UI)');
  await page.close();
} finally {
  await browser.close();
  if (server) {
    const closed = new Promise(resolve => server.once('close', resolve));
    server.kill('SIGTERM');
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('\nAll web smoke tests passed.');

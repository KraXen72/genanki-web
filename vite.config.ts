import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import runtimeLock from './runtime.lock.json';

function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);

  try {
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const changes = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
    return changes.trim() ? `${commit}-dirty` : commit;
  } catch {
    return 'unknown';
  }
}

/** Evaluated by Vite once per build; the browser receives only these literal strings. */
export const buildInfo = {
  commit: buildCommit(),
  genanki: runtimeLock.wheels.find((wheel) => wheel.name === 'genanki')!.version,
  timestamp:
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(new Date()) + ' UTC',
};

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  base: process.env.VITE_BASE || '/',
  server: { port: 3000 },
  build: { target: 'esnext' },
});

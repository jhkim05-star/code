import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of ['sw.js', ...['assets', 'server'].flatMap(dir => readdirSync(dir).filter(f => /\.m?js$/.test(f)).map(f => dir + '/' + f))]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

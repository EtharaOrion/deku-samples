// Boot: migrate, seed, then start the Astro standalone server on 0.0.0.0.
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
  const { migrate } = await import('./db/migrate.js');
  const { seed } = await import('./seed.js');
  const { pool } = await import('./db/index.js');

  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await migrate();
      await seed();
      break;
    } catch (e) {
      if (attempt === 30) {
        console.log(JSON.stringify({ event: 'boot_db_failed', error: String(e) }));
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.end().catch(() => {});

  const entry = path.join(__dirname, '..', 'dist', 'server', 'entry.mjs');
  const port = String(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173);
  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port, HOST: '0.0.0.0' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  const stop = (sig) => { child.kill(sig); };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main();

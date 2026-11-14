/**
 * Starts `ng serve` with FRONTEND_PORT from the root `.env`.
 * Extra arguments are forwarded, and a later `--port` overrides the file.
 */
const { spawn } = require('child_process');
const path = require('path');

require('./load-env');

const frontend = path.join(__dirname, '..', 'frontend');
const ng = path.join(frontend, 'node_modules', '.bin', 'ng');
const port = process.env.FRONTEND_PORT || '4200';
const child = spawn(ng, ['serve', '--port', String(port), ...process.argv.slice(2)], {
  cwd: frontend,
  stdio: 'inherit',
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

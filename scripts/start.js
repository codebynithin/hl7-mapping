/**
 * Locally, `npm start` runs the API and the Angular dev server.
 * On Render, only the production server runs. `ng serve` rebuilds the app
 * in memory and gets the free instance killed, which surfaces as a 502.
 */
const { spawn } = require('child_process');

const onRender = process.env.RENDER === 'true';
const child = onRender
  ? spawn('npm', ['run', 'start:prod'], { stdio: 'inherit' })
  : spawn(
      'npx',
      [
        'concurrently',
        '--names',
        'api,web',
        '--prefix-colors',
        'blue,magenta',
        '--kill-others-on-fail',
        'npm run start:prod',
        'npm:dev:frontend',
      ],
      { stdio: 'inherit' },
    );

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

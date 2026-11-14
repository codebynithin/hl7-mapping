/**
 * Loads the repository-root `.env` into `process.env`.
 * Existing variables win, so `DB_NAME=other npm run seed` still overrides the file.
 * Uses the backend's dotenv install so this works after `npm install` at the root.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function loadDotenv() {
  const candidates = [
    path.join(root, 'node_modules', 'dotenv'),
    path.join(root, 'backend', 'node_modules', 'dotenv'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  throw new Error('dotenv is not installed. Run npm install from the repository root.');
}

const result = loadDotenv().config({ path: envPath, quiet: true });
if (result.error && result.error.code === 'ENOENT') {
  console.warn(`[env] ${envPath} not found. Copy .env.example to .env.`);
}

module.exports = { envPath };

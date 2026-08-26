// Jest global setup for the e2e suite. Runs once before any e2e test file.
// See testing.md, "Test database": "The Jest global setup runs
// `prisma migrate reset --force --skip-seed` once, and each test file
// truncates the tables it touches in beforeEach."
//
// Plain CommonJS (not .ts): Jest does not run globalSetup/globalTeardown
// modules through the configured `transform`, so a TS file here would need
// its own ts-node registration. Keeping this as .js avoids that entirely.
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};

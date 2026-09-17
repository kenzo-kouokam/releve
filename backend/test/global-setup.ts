import { execSync } from 'node:child_process';
import { URL_TEST } from './env';

export default function preparerBase(): void {
  // `migrate deploy` cree la base si elle n'existe pas et rejoue l'historique :
  // le schema teste est exactement celui qui partira en production.
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: URL_TEST },
    stdio: 'inherit',
  });
}

// src/services/updater-service.ts
//
// Kontrolliertes Self-Update, gesteuert über `devices.desired_version` in
// Supabase (statt „immer neuestes Release"). Läuft periodisch, vergleicht die
// laufende Version mit der gewünschten und führt bei Bedarf ein git-basiertes
// Update durch. systemd (Restart=always) startet den Prozess danach neu.
//
// Sicherheitsnetz: Vor dem Checkout wird der aktuelle Commit gemerkt; schlägt
// npm ci / build fehl, wird auf den vorherigen Stand zurückgerollt, damit ein
// kaputtes Release die Box nicht lahmlegt.
import { execSync } from 'node:child_process';
import type { FastifyBaseLogger } from 'fastify';
import { CONFIG } from '../config';
import { compareVersions, getCurrentVersion } from '../helpers/auto-updater';

export interface UpdaterDeps {
  log: FastifyBaseLogger;
  /** Liefert die vom Backend gewünschte Version (aus dem sync-service). */
  getDesiredVersion: () => string | undefined;
}

export class UpdaterService {
  private log: FastifyBaseLogger;
  private getDesiredVersion: () => string | undefined;
  private enabled: boolean;
  private timer?: ReturnType<typeof setInterval>;

  constructor(deps: UpdaterDeps) {
    this.log = deps.log;
    this.getDesiredVersion = deps.getDesiredVersion;
    this.enabled = process.env.AUTO_UPDATE_APPLY === 'true';
  }

  start(intervalMs = 5 * 60_000): void {
    if (!this.enabled) {
      this.log.info('Updater disabled (set AUTO_UPDATE_APPLY=true to enable)');
      return;
    }
    this.timer = setInterval(() => this.checkOnce(), intervalMs);
    this.checkOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  checkOnce(): void {
    const desired = this.getDesiredVersion();
    if (!desired) return;
    const current = getCurrentVersion();
    if (compareVersions(desired, current) === 0) return;

    this.log.warn({ current, desired }, 'Applying controlled self-update');
    const previousCommit = this.safeExec('git rev-parse HEAD');
    try {
      const tag = /^v/.test(desired) ? desired : `v${desired}`;
      execSync('git fetch --tags', { stdio: 'inherit' });
      execSync(`git checkout ${tag}`, { stdio: 'inherit' });
      execSync('npm ci', { stdio: 'inherit' });
      execSync('npm run build', { stdio: 'inherit' });
      this.log.warn({ tag }, 'Update applied – exiting for restart by systemd');
      process.exit(0);
    } catch (err) {
      this.log.error({ err }, 'Update failed – rolling back');
      if (previousCommit) {
        try {
          execSync(`git checkout ${previousCommit}`, { stdio: 'inherit' });
          execSync('npm ci', { stdio: 'inherit' });
          execSync('npm run build', { stdio: 'inherit' });
          this.log.warn('Rollback complete');
        } catch (rollbackErr) {
          this.log.error({ rollbackErr }, 'Rollback failed – manual intervention required');
        }
      }
    }
  }

  private safeExec(cmd: string): string | null {
    try {
      return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }
}

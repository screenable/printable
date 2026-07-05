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
import { logEvent } from '../app-context';
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

    // Sicherheit: desired_version kommt aus Supabase und fließt in git-Kommandos.
    // Nur strikte Versions-/Tag-Namen zulassen (verhindert Command-Injection).
    if (!/^v?\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(desired)) {
      this.log.error({ desired }, 'Ungültige desired_version – Update abgebrochen');
      return;
    }

    const current = getCurrentVersion();
    if (compareVersions(desired, current) === 0) return;

    this.log.warn({ current, desired }, 'Applying controlled self-update');
    const previousCommit = this.safeExec('git rev-parse HEAD');
    try {
      const tag = /^v/.test(desired) ? desired : `v${desired}`;
      this.run('git fetch --tags --prune');
      this.run(`git checkout ${tag}`);
      this.buildCurrentCheckout();
      this.log.warn({ tag }, 'Update applied – exiting for restart by systemd');
      logEvent('info', 'update_applied', `Update auf ${tag}`, { from: current, to: desired });
      process.exit(0);
    } catch (err) {
      this.log.error({ err }, 'Update failed – rolling back');
      logEvent('error', 'update_failed', 'Update fehlgeschlagen – Rollback', {
        desired,
        error: String(err),
      });
      if (previousCommit) {
        try {
          this.run(`git checkout ${previousCommit}`);
          this.buildCurrentCheckout();
          this.log.warn('Rollback complete');
        } catch (rollbackErr) {
          this.log.error({ rollbackErr }, 'Rollback failed – manual intervention required');
        }
      }
    }
  }

  /**
   * Installiert Abhängigkeiten und baut den aktuellen Checkout.
   * WICHTIG: `--include=dev`, weil der Service NODE_ENV=production setzt und
   * `npm ci` sonst TypeScript (devDependency) weglässt und der Build scheitert.
   */
  private buildCurrentCheckout(): void {
    this.run('npm ci --include=dev');
    this.run('npm run build');
  }

  private run(cmd: string): void {
    // 20 min Timeout: canvas & Co. bauen auf dem Pi nativ und dauern.
    execSync(cmd, { stdio: 'inherit', timeout: 20 * 60_000 });
  }

  private safeExec(cmd: string): string | null {
    try {
      return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }
}

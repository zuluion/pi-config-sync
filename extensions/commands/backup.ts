/**
 * Config backup command handler
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { CloudConfig } from '../types';
import { FileError, ErrorCodes, AppError } from '../types';
import { readJson, readSettings, filterSettings, extractPackages, calculateChecksum } from '../helpers';
import { collectFiles } from '../file-collector';
import { webdavUpload } from '../cloud/webdav';
import { gistUpload } from '../cloud/gist';
import { BackupHistoryManager } from '../history';
import { CONFIG_FILE } from '../helpers';
import { handleCommandError, getErrorSuggestion } from '../error-handler';

// ─── Config Backup Command ───────────────────────────────────────────────────

export function registerBackupCommand(pi: ExtensionAPI): void {
  const historyManager = new BackupHistoryManager();

  pi.registerCommand('config-backup', {
    description: 'Backup config to WebDAV or GitHub Gist',
    handler: async (_args, ctx) => {
      let cfg: CloudConfig | null = null;
      try {
        cfg = await readJson<CloudConfig>(CONFIG_FILE);
      } catch (err) {
        if (err instanceof FileError && err.code === ErrorCodes.FILE_NOT_FOUND) {
          // Config file doesn't exist
        } else {
          throw err;
        }
      }

      if (!cfg?.provider) {
        ctx.ui.notify(
          'No cloud provider configured. Run /config-cloud-setup first.',
          'error'
        );
        return;
      }

      const settings = await readSettings();
      const data = {
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        settings: filterSettings(settings),
        packages: extractPackages(settings),
        files: await collectFiles(),
      };
      const json = JSON.stringify(data, null, 2);
      const checksum = calculateChecksum(data);

      const startTime = Date.now();

      try {
        ctx.ui.setStatus('backup', 'Uploading...');
        if (cfg.provider === 'webdav' && cfg.webdav) {
          await webdavUpload(cfg.webdav, json);
          ctx.ui.notify('✓ Backed up to WebDAV.', 'info');
        } else if (cfg.provider === 'gist' && cfg.gist) {
          const gistId = await gistUpload(cfg.gist, json);
          // Persist the gist ID for future updates
          if (!cfg.gist.gistId) {
            cfg.gist.gistId = gistId;
            const { writeJson } = await import('../helpers');
            await writeJson(CONFIG_FILE, cfg);
          }
          ctx.ui.notify(`✓ Backed up to Gist: ${gistId}`, 'info');
        }

        // Record success in history
        await historyManager.addRecord({
          timestamp: new Date().toISOString(),
          source: cfg.provider,
          status: 'success',
          fileCount: Object.keys(data.files).length,
          packageCount: data.packages.length,
          checksum,
          duration: Date.now() - startTime,
        });
      } catch (err: unknown) {
        // Record failure in history
        await historyManager.addRecord({
          timestamp: new Date().toISOString(),
          source: cfg.provider,
          status: 'failed',
          fileCount: Object.keys(data.files).length,
          packageCount: data.packages.length,
          checksum,
          duration: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        });

        ctx.ui.notify(
          `Backup failed: ${err instanceof Error ? err.message : err}`,
          'error'
        );
      } finally {
        ctx.ui.setStatus('backup', undefined);
      }
    },
  });
}
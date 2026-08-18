/**
 * Import config command handler
 */

import { readFile } from 'node:fs/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { BackupData, CloudConfig } from '../types';
import { FileError, ValidationError, ErrorCodes } from '../types';
import { readJson, readSettings, writeJson, SETTINGS_FILE, CONFIG_FILE } from '../helpers';
import { restoreFiles } from '../file-collector';
import { webdavDownload } from '../cloud/webdav';
import { gistDownload } from '../cloud/gist';

// ─── Import Config Command ───────────────────────────────────────────────────

export function registerImportCommand(pi: ExtensionAPI): void {
  pi.registerCommand('import-config', {
    description: 'Restore from local file or cloud (webdav/gist)',
    handler: async (args, ctx) => {
      const source = args?.trim();
      let data: BackupData | null = null;
      let sourceLabel = '';

      // Determine source
      if (!source || source === 'webdav' || source === 'gist') {
        // Cloud source
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

        const provider = source as 'webdav' | 'gist' | undefined;

        if (!cfg?.provider && !provider) {
          ctx.ui.notify(
            'Usage: /import-config <file>\nor: /import-config webdav\nor: /import-config gist',
            'error'
          );
          return;
        }

        const useProvider = provider || cfg!.provider;
        if (useProvider === 'webdav' && cfg?.webdav) {
          sourceLabel = 'WebDAV';
          ctx.ui.setStatus('import', 'Downloading from WebDAV...');
          try {
            const json = await webdavDownload(cfg.webdav);
            data = JSON.parse(json);
          } catch (err: unknown) {
            ctx.ui.notify(
              `WebDAV download failed: ${err instanceof Error ? err.message : err}`,
              'error'
            );
            return;
          } finally {
            ctx.ui.setStatus('import', undefined);
          }
        } else if (useProvider === 'gist' && cfg?.gist) {
          sourceLabel = 'GitHub Gist';
          ctx.ui.setStatus('import', 'Downloading from Gist...');
          try {
            const json = await gistDownload(cfg.gist);
            data = JSON.parse(json);
          } catch (err: unknown) {
            ctx.ui.notify(
              `Gist download failed: ${err instanceof Error ? err.message : err}`,
              'error'
            );
            return;
          } finally {
            ctx.ui.setStatus('import', undefined);
          }
        } else {
          ctx.ui.notify(
            `No ${useProvider} configuration found. Run /config-cloud-setup first.`,
            'error'
          );
          return;
        }
      } else {
        // Local file
        sourceLabel = source;
        try {
          data = await readJson<BackupData>(source);
        } catch (err: unknown) {
          ctx.ui.notify(
            `Read failed: ${err instanceof Error ? err.message : err}`,
            'error'
          );
          return;
        }
      }

      if (!data || data.version !== 1) {
        throw new ValidationError(
          `Unsupported version: ${data?.version}`,
          ErrorCodes.VALIDATION_UNSUPPORTED_VERSION
        );
      }

      const fileCount = Object.keys(data.files ?? {}).length;
      const confirmed = await ctx.ui.confirm(
        'Import Config',
        `Restore ${data.packages.length} package(s) and ${fileCount} file(s)\nfrom ${sourceLabel} (${data.exportedAt})?`
      );
      if (!confirmed) return;

      // Merge settings
      const current = await readSettings();
      const merged = { ...data.settings };
      for (const [key, value] of Object.entries(current)) {
        if (!(key in merged)) merged[key] = value;
      }
      await writeJson(SETTINGS_FILE, merged);
      ctx.ui.notify('Settings merged.', 'info');

      // Restore files
      if (data.files && Object.keys(data.files).length > 0) {
        const count = await restoreFiles(data.files);
        ctx.ui.notify(`Restored ${count} file(s).`, 'info');
      }

      // Install packages
      let installed = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const pkg of data.packages) {
        try {
          ctx.ui.setStatus('import', `Installing ${pkg}...`);
          const result = await pi.exec('pi', ['install', pkg], {
            timeout: 120_000,
          });
          if (result.code === 0) installed++;
          else {
            failed++;
            errors.push(
              `${pkg}: ${result.stderr.trim() || 'exit ' + result.code}`
            );
          }
        } catch (err: unknown) {
          failed++;
          errors.push(`${pkg}: ${err instanceof Error ? err.message : err}`);
        }
      }

      ctx.ui.setStatus('import', undefined);
      ctx.ui.notify(
        [
          `✓ Import done: ${installed} installed, ${failed} failed`,
          ...errors.map((e) => `  ✗ ${e}`),
          ``,
          `Restart pi or /reload to apply.`,
        ].join('\n'),
        failed > 0 ? 'warning' : 'info'
      );
    },
  });
}
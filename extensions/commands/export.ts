/**
 * Export config command handler
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { BackupData } from '../types';
import { readSettings, extractPackages, filterSettings, writeJson } from '../helpers';
import { collectFiles } from '../file-collector';
import { handleCommandError } from '../error-handler';

// ─── Export Config Command ───────────────────────────────────────────────────

export function registerExportCommand(pi: ExtensionAPI): void {
  pi.registerCommand('export-config', {
    description: 'Export settings + packages + custom files to local JSON',
    handler: async (args, ctx) => {
      try {
        const settings = await readSettings();
        const packages = extractPackages(settings);
        const files = await collectFiles();

        const data: BackupData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: filterSettings(settings),
          packages,
          files,
        };

        const outputPath = args?.trim() || join(homedir(), 'pi-config-backup.json');
        await writeJson(outputPath, data);

        const fileCount = Object.keys(files).length;
        ctx.ui.notify(
          [
            `✓ Exported to: ${outputPath}`,
            ``,
            `Packages: ${packages.length}`,
            `Custom files: ${fileCount}`,
            ...Object.keys(files).map((f) => `  • ${f}`),
            ``,
            `On new device: /import-config ${outputPath}`,
          ].join('\n'),
          'info'
        );
      } catch (err) {
        handleCommandError(ctx, err, 'export config');
      }
    },
  });
}
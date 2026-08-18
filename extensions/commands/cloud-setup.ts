/**
 * Cloud setup and status command handlers
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { CloudConfig } from '../types';
import { FileError, ErrorCodes, AppError } from '../types';
import { handleCommandError, getErrorSuggestion } from '../error-handler';
import { readJson, writeJson, CONFIG_FILE } from '../helpers';
import { validateWebDAVConfig } from '../cloud/webdav';
import { validateGistConfig } from '../cloud/gist';

// ─── Cloud Setup Command ─────────────────────────────────────────────────────

export function registerCloudSetupCommand(pi: ExtensionAPI): void {
  pi.registerCommand('config-cloud-setup', {
    description: 'Configure WebDAV or GitHub Gist cloud backup',
    handler: async (_args, ctx) => {
      const provider = await ctx.ui.select('Select cloud provider:', [
        { label: 'WebDAV', value: 'webdav' },
        { label: 'GitHub Gist', value: 'gist' },
      ]);
      if (!provider) return;

      if (provider === 'webdav') {
        const url = await ctx.ui.input(
          'WebDAV URL:',
          'https://dav.example.com/dav/'
        );
        if (!url) return;
        const username = await ctx.ui.input('Username:', '');
        if (!username) return;
        const password = await ctx.ui.input('Password:', '');
        if (!password) return;
        const remotePath = await ctx.ui.input(
          'Remote path:',
          '/pi-config-backup.json'
        );

        const webdavConfig = {
          url,
          username,
          password,
          remotePath: remotePath || '/pi-config-backup.json',
        };

        if (!validateWebDAVConfig(webdavConfig)) {
          ctx.ui.notify('Invalid WebDAV configuration.', 'error');
          return;
        }

        const cfg: CloudConfig = {
          provider: 'webdav',
          webdav: webdavConfig,
        };
        await writeJson(CONFIG_FILE, cfg);
        ctx.ui.notify('✓ WebDAV configured.', 'info');
      } else {
        const token = await ctx.ui.input('GitHub token:', 'ghp_...');
        if (!token) return;

        const gistConfig = {
          token,
          filename: 'pi-config-backup.json',
        };

        if (!validateGistConfig(gistConfig)) {
          ctx.ui.notify('Invalid Gist configuration.', 'error');
          return;
        }

        const cfg: CloudConfig = {
          provider: 'gist',
          gist: gistConfig,
        };
        await writeJson(CONFIG_FILE, cfg);
        ctx.ui.notify(
          '✓ Gist configured.\nRun /config-backup to create the gist.',
          'info'
        );
      }
    },
  });
}

// ─── Cloud Status Command ────────────────────────────────────────────────────

export function registerCloudStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand('config-cloud-status', {
    description: 'Show current cloud backup configuration',
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
          'No cloud provider configured.\nRun /config-cloud-setup to set up.',
          'info'
        );
        return;
      }

      const lines: string[] = [`Provider: ${cfg.provider}`];
      if (cfg.provider === 'webdav' && cfg.webdav) {
        lines.push(`URL: ${cfg.webdav.url}`);
        lines.push(`Username: ${cfg.webdav.username}`);
        lines.push(`Remote path: ${cfg.webdav.remotePath}`);
        lines.push(`Password: ${'*'.repeat(cfg.webdav.password.length)}`);
      } else if (cfg.provider === 'gist' && cfg.gist) {
        lines.push(`Token: ${cfg.gist.token.slice(0, 4)}${'*'.repeat(6)}`);
        lines.push(
          `Gist ID: ${cfg.gist.gistId || '(not yet created)'}`
        );
        lines.push(`Filename: ${cfg.gist.filename}`);
      }

      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });
}
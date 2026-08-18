/**
 * Cloud setup and status command handlers
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { CloudConfig } from '../types';
import { FileError, ErrorCodes, AppError } from '../types';
import { readJson, writeJson, CONFIG_FILE } from '../helpers';
import { validateWebDAVConfig } from '../cloud/webdav';
import { validateGistConfig } from '../cloud/gist';

// ─── Cloud Setup Command ─────────────────────────────────────────────────────

export function registerCloudSetupCommand(pi: ExtensionAPI): void {
  pi.registerCommand('config-cloud-setup', {
    description: 'Configure WebDAV or GitHub Gist cloud backup',
    handler: async (_args, ctx) => {
      const provider = await ctx.ui.select('Select cloud provider:', [
        'WebDAV',
        'GitHub Gist',
      ]);
      if (!provider) return;

      if (provider === 'WebDAV') {
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

        // 读取现有配置，保留其他 provider 的配置
        let existingCfg: Partial<CloudConfig> = {};
        try {
          existingCfg = await readJson<CloudConfig>(CONFIG_FILE);
        } catch {
          // 配置文件不存在，忽略
        }
        
        const cfg: CloudConfig = {
          provider: 'webdav',
          webdav: webdavConfig,
          // 保留其他 provider 的配置
          gist: existingCfg.gist,
        };
        await writeJson(CONFIG_FILE, cfg);
        ctx.ui.notify('✓ WebDAV configured.', 'info');
      } else if (provider === 'GitHub Gist') {
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

        // 读取现有配置，保留其他 provider 的配置
        let existingCfg: Partial<CloudConfig> = {};
        try {
          existingCfg = await readJson<CloudConfig>(CONFIG_FILE);
        } catch {
          // 配置文件不存在，忽略
        }
        
        const cfg: CloudConfig = {
          provider: 'gist',
          gist: gistConfig,
          // 保留其他 provider 的配置
          webdav: existingCfg.webdav,
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

      const lines: string[] = [];
      
      // 显示默认备份目标
      lines.push(`Default backup target: ${cfg.provider}`);
      lines.push('');
      
      // 显示所有已配置的云服务
      if (cfg.webdav) {
        lines.push('── WebDAV ──');
        lines.push(`  URL: ${cfg.webdav.url}`);
        lines.push(`  Username: ${cfg.webdav.username}`);
        lines.push(`  Remote path: ${cfg.webdav.remotePath}`);
        lines.push(`  Password: ${'*'.repeat(cfg.webdav.password.length)}`);
        lines.push('');
      }
      
      if (cfg.gist) {
        lines.push('── GitHub Gist ──');
        lines.push(`  Token: ${cfg.gist.token.slice(0, 4)}${'*'.repeat(6)}`);
        lines.push(
          `  Gist ID: ${cfg.gist.gistId || '(not yet created)'}`
        );
        lines.push(`  Filename: ${cfg.gist.filename}`);
        lines.push('');
      }
      
      if (!cfg.webdav && !cfg.gist) {
        lines.push('No cloud provider configured.');
        lines.push('Run /config-cloud-setup to set up.');
      }

      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });
}
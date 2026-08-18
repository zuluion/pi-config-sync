/**
 * Config Migration & Cloud Backup Extension
 *
 * Commands:
 *   /export-config [file]       — Export to local JSON (settings + packages + custom files)
 *   /import-config <file>       — Restore from local JSON
 *   /import-config webdav       — Restore from WebDAV
 *   /import-config gist         — Restore from GitHub Gist
 *   /import-config              — Restore from configured cloud provider
 *   /config-backup              — Backup to cloud (WebDAV or Gist)
 *   /config-cloud-setup         — Configure WebDAV or Gist credentials
 *   /config-cloud-status        — Show current cloud config
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerExportCommand } from './commands/export';
import { registerImportCommand } from './commands/import';
import { registerBackupCommand } from './commands/backup';
import {
  registerCloudSetupCommand,
  registerCloudStatusCommand,
} from './commands/cloud-setup';

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Register all commands
  registerExportCommand(pi);
  registerImportCommand(pi);
  registerBackupCommand(pi);
  registerCloudSetupCommand(pi);
  registerCloudStatusCommand(pi);
}
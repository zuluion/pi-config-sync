import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerImportCommand } from '../../commands/import';
import {
  createMockExtensionAPI,
  createMockContext,
  createTestBackupData,
  createTestWebDAVConfig,
  createTestGistConfig,
} from '../factories';
import { FileError, ErrorCodes } from '../../types';

// Mock dependencies
vi.mock('../../helpers', () => ({
  readJson: vi.fn(),
  readSettings: vi.fn().mockResolvedValue({}),
  writeJson: vi.fn(),
  SETTINGS_FILE: '/mock/settings.json',
  CONFIG_FILE: '/mock/config.json',
}));

vi.mock('../../file-collector', () => ({
  restoreFiles: vi.fn().mockResolvedValue(5),
}));

vi.mock('../../cloud/webdav', () => ({
  webdavDownload: vi.fn(),
  webdavList: vi.fn(),
}));

vi.mock('../../cloud/gist', () => ({
  gistDownload: vi.fn(),
}));

describe('Import Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
    vi.clearAllMocks();
  });

  it('should register import-config command', () => {
    registerImportCommand(mockPi as any);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      'import-config',
      expect.objectContaining({
        description: expect.stringContaining('Restore'),
      })
    );
  });

  it('should show usage when no source provided and no cloud config', async () => {
    const { readJson } = await import('../../helpers');
    (readJson as any).mockRejectedValue(
      new FileError('File not found', ErrorCodes.FILE_NOT_FOUND)
    );

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
      'error'
    );
  });

  it('should import from local file', async () => {
    const { readJson } = await import('../../helpers');
    const testBackup = createTestBackupData();
    (readJson as any).mockResolvedValue(testBackup);

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('/path/to/backup.json', mockCtx);

    expect(mockCtx.ui.confirm).toHaveBeenCalled();
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Import done'),
      'info'
    );
  });

  // ─── WebDAV Import with File Listing ─────────────────────────────────────

  describe('WebDAV import with file listing', () => {
    it('should list remote files before downloading', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList, webdavDownload } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();
      const testBackup = createTestBackupData();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockResolvedValue([
        {
          name: 'pi-config_28800_2026-08-17_14-30-00.json',
          path: 'Pi-Config-Sync/pi-config_28800_2026-08-17_14-30-00.json',
          lastModified: 'Mon, 17 Aug 2026 06:30:00 GMT',
          size: 12345,
        },
        {
          name: 'pi-config_28800_2026-08-16_10-00-00.json',
          path: 'Pi-Config-Sync/pi-config_28800_2026-08-16_10-00-00.json',
          lastModified: 'Sun, 16 Aug 2026 02:00:00 GMT',
          size: 11000,
        },
      ]);
      (webdavDownload as any).mockResolvedValue(JSON.stringify(testBackup));
      mockCtx.ui.select.mockResolvedValue(
        'pi-config_28800_2026-08-17_14-30-00.json  |  modified: Mon, 17 Aug 2026 06:30:00 GMT  |  12.1 KB'
      );

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      // Should list files first
      expect(webdavList).toHaveBeenCalledWith(testConfig.webdav);
      // Should show selection UI
      expect(mockCtx.ui.select).toHaveBeenCalledWith(
        'Select a backup to import:',
        expect.arrayContaining([
          expect.stringContaining('pi-config_28800_2026-08-17_14-30-00.json'),
        ])
      );
      // Should download selected file
      expect(webdavDownload).toHaveBeenCalledWith(
        testConfig.webdav,
        'Pi-Config-Sync/pi-config_28800_2026-08-17_14-30-00.json'
      );
      // Should complete import
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Import done'),
        'info'
      );
    });

    it('should show message when no backup files found', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockResolvedValue([]);

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('No backup files found'),
        'warning'
      );
    });

    it('should handle webdavList failure', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockRejectedValue(new Error('PROPFIND failed'));

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('PROPFIND failed'),
        'error'
      );
    });

    it('should handle user cancelling file selection', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockResolvedValue([
        {
          name: 'backup.json',
          path: 'Pi-Config-Sync/backup.json',
        },
      ]);
      mockCtx.ui.select.mockResolvedValue(undefined);

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      // Should not proceed with import
      expect(mockCtx.ui.confirm).not.toHaveBeenCalled();
    });

    it('should display file size in KB in selection options', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockResolvedValue([
        {
          name: 'backup.json',
          path: 'Pi-Config-Sync/backup.json',
          lastModified: 'Mon, 17 Aug 2026 06:30:00 GMT',
          size: 25600,
        },
      ]);
      mockCtx.ui.select.mockResolvedValue(undefined);

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      // Check the select options format
      const selectCall = mockCtx.ui.select.mock.calls[0];
      const options = selectCall[1];
      expect(options[0]).toContain('backup.json');
      expect(options[0]).toContain('25.0 KB');
      expect(options[0]).toContain('modified:');
    });

    it('should show source label with filename in confirm dialog', async () => {
      const { readJson } = await import('../../helpers');
      const { webdavList, webdavDownload } = await import('../../cloud/webdav');
      const testConfig = createTestWebDAVConfig();
      const testBackup = createTestBackupData();

      (readJson as any).mockResolvedValue(testConfig);
      (webdavList as any).mockResolvedValue([
        {
          name: 'my-backup.json',
          path: 'Pi-Config-Sync/my-backup.json',
        },
      ]);
      (webdavDownload as any).mockResolvedValue(JSON.stringify(testBackup));
      mockCtx.ui.select.mockResolvedValue('my-backup.json');

      registerImportCommand(mockPi as any);
      const handler = mockPi.registerCommand.mock.calls[0][1].handler;
      await handler('webdav', mockCtx);

      // Confirm dialog should mention WebDAV and filename
      expect(mockCtx.ui.confirm).toHaveBeenCalledWith(
        'Import Config',
        expect.stringContaining('WebDAV (my-backup.json)')
      );
    });
  });

  // ─── Gist Import ─────────────────────────────────────────────────────────

  it('should import from Gist', async () => {
    const { readJson } = await import('../../helpers');
    const { gistDownload } = await import('../../cloud/gist');
    const testConfig = createTestGistConfig();
    const testBackup = createTestBackupData();

    (readJson as any).mockResolvedValue(testConfig);
    (gistDownload as any).mockResolvedValue(JSON.stringify(testBackup));

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('gist', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Import done'),
      'info'
    );
  });

  it('should handle WebDAV download failure', async () => {
    const { readJson } = await import('../../helpers');
    const { webdavList, webdavDownload } = await import('../../cloud/webdav');
    const testConfig = createTestWebDAVConfig();

    (readJson as any).mockResolvedValue(testConfig);
    (webdavList as any).mockResolvedValue([
      { name: 'backup.json', path: 'Pi-Config-Sync/backup.json' },
    ]);
    (webdavDownload as any).mockRejectedValue(new Error('Download failed'));
    mockCtx.ui.select.mockResolvedValue('backup.json');

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('webdav', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Download failed'),
      'error'
    );
  });

  it('should handle Gist download failure', async () => {
    const { readJson } = await import('../../helpers');
    const { gistDownload } = await import('../../cloud/gist');
    const testConfig = createTestGistConfig();

    (readJson as any).mockResolvedValue(testConfig);
    (gistDownload as any).mockRejectedValue(new Error('Download failed'));

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('gist', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Download failed'),
      'error'
    );
  });

  it('should handle unsupported version', async () => {
    const { readJson } = await import('../../helpers');
    const testBackup = createTestBackupData({ version: 2 as any });

    (readJson as any).mockResolvedValue(testBackup);

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;

    await handler('/path/to/backup.json', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported version'),
      'error'
    );
  });

  it('should handle user cancellation', async () => {
    const { readJson } = await import('../../helpers');
    const testBackup = createTestBackupData();

    (readJson as any).mockResolvedValue(testBackup);
    mockCtx.ui.confirm.mockResolvedValue(false);

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('/path/to/backup.json', mockCtx);

    expect(mockCtx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining('Import done'),
      'info'
    );
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerImportCommand } from '../../commands/import';
import { createMockExtensionAPI, createMockContext, createTestBackupData, createTestWebDAVConfig, createTestGistConfig } from '../factories';
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
    (readJson as any).mockRejectedValue(new FileError('File not found', ErrorCodes.FILE_NOT_FOUND));

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

  it('should import from WebDAV', async () => {
    const { readJson } = await import('../../helpers');
    const { webdavDownload } = await import('../../cloud/webdav');
    const testConfig = createTestWebDAVConfig();
    const testBackup = createTestBackupData();

    (readJson as any).mockResolvedValue(testConfig);
    (webdavDownload as any).mockResolvedValue(JSON.stringify(testBackup));

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('webdav', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Import done'),
      'info'
    );
  });

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
    const { webdavDownload } = await import('../../cloud/webdav');
    const testConfig = createTestWebDAVConfig();

    (readJson as any).mockResolvedValue(testConfig);
    (webdavDownload as any).mockRejectedValue(new Error('Download failed'));

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('webdav', mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected error'),
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
      expect.stringContaining('Unexpected error'),
      'error'
    );
  });

  it('should handle unsupported version', async () => {
    const { readJson } = await import('../../helpers');
    const testBackup = createTestBackupData({ version: 2 as any });

    (readJson as any).mockResolvedValue(testBackup);

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    
    // Should throw ValidationError
    await expect(handler('/path/to/backup.json', mockCtx)).rejects.toThrow();
  });

  it('should handle user cancellation', async () => {
    const { readJson } = await import('../../helpers');
    const testBackup = createTestBackupData();

    (readJson as any).mockResolvedValue(testBackup);
    mockCtx.ui.confirm.mockResolvedValue(false);

    registerImportCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler('/path/to/backup.json', mockCtx);

    // Should not proceed with import
    expect(mockCtx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining('Import done'),
      'info'
    );
  });
});
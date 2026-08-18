import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerBackupCommand } from '../../commands/backup';
import {
  createMockExtensionAPI,
  createMockContext,
  createTestWebDAVConfig,
  createTestGistConfig,
} from '../factories';
import { FileError, ErrorCodes } from '../../types';

// Mock dependencies
vi.mock('../../helpers', () => ({
  readJson: vi.fn(),
  readSettings: vi.fn().mockResolvedValue({}),
  filterSettings: vi.fn((settings) => settings),
  extractPackages: vi.fn(() => ['test-package']),
  calculateChecksum: vi.fn(() => 'mock-checksum'),
  writeJson: vi.fn(),
  CONFIG_FILE: '/mock/config.json',
}));

vi.mock('../../file-collector', () => ({
  collectFiles: vi.fn().mockResolvedValue({ 'test.ts': 'base64content' }),
}));

vi.mock('../../cloud/webdav', () => ({
  webdavUpload: vi.fn(),
  generateBackupFilename: vi.fn(() => 'pi-config_28800_2026-08-17_14:30:00.json'),
}));

vi.mock('../../cloud/gist', () => ({
  gistUpload: vi.fn().mockResolvedValue('new-gist-id'),
}));

vi.mock('../../history', () => ({
  BackupHistoryManager: vi.fn().mockImplementation(() => ({
    addRecord: vi.fn(),
  })),
}));

describe('Backup Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
    vi.clearAllMocks();
  });

  it('should register config-backup command', () => {
    registerBackupCommand(mockPi as any);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      'config-backup',
      expect.objectContaining({
        description: expect.stringContaining('Backup'),
      })
    );
  });

  it('should show error when no cloud provider configured', async () => {
    const { readJson } = await import('../../helpers');
    (readJson as any).mockRejectedValue(
      new FileError('File not found', ErrorCodes.FILE_NOT_FOUND)
    );

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('No cloud provider'),
      'error'
    );
  });

  it('should backup to WebDAV with generated filename', async () => {
    const { readJson } = await import('../../helpers');
    const { webdavUpload, generateBackupFilename } = await import(
      '../../cloud/webdav'
    );
    const testConfig = createTestWebDAVConfig();

    (readJson as any).mockResolvedValue(testConfig);

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(generateBackupFilename).toHaveBeenCalledWith('pi-config');
    expect(webdavUpload).toHaveBeenCalledWith(
      testConfig.webdav,
      expect.any(String),
      'pi-config_28800_2026-08-17_14:30:00.json'
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Backed up to WebDAV: pi-config_28800_2026-08-17_14:30:00.json'),
      'info'
    );
  });

  it('should use custom deviceName in filename', async () => {
    const { readJson } = await import('../../helpers');
    const { generateBackupFilename } = await import('../../cloud/webdav');
    const testConfig = createTestWebDAVConfig({ deviceName: 'work-laptop' });

    (readJson as any).mockResolvedValue(testConfig);

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(generateBackupFilename).toHaveBeenCalledWith('work-laptop');
  });

  it('should backup to Gist', async () => {
    const { readJson } = await import('../../helpers');
    const { gistUpload } = await import('../../cloud/gist');
    const testConfig = createTestGistConfig();

    (readJson as any).mockResolvedValue(testConfig);

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(gistUpload).toHaveBeenCalled();
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Backed up to Gist'),
      'info'
    );
  });

  it('should handle WebDAV upload failure', async () => {
    const { readJson } = await import('../../helpers');
    const { webdavUpload } = await import('../../cloud/webdav');
    const testConfig = createTestWebDAVConfig();

    (readJson as any).mockResolvedValue(testConfig);
    (webdavUpload as any).mockRejectedValue(new Error('Upload failed'));

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Backup failed'),
      'error'
    );
  });

  it('should handle Gist upload failure', async () => {
    const { readJson } = await import('../../helpers');
    const { gistUpload } = await import('../../cloud/gist');
    const testConfig = createTestGistConfig();

    (readJson as any).mockResolvedValue(testConfig);
    (gistUpload as any).mockRejectedValue(new Error('Upload failed'));

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Backup failed'),
      'error'
    );
  });

  it('should let user choose when both providers configured', async () => {
    const { readJson } = await import('../../helpers');
    const testConfig = {
      provider: 'webdav' as const,
      webdav: createTestWebDAVConfig().webdav,
      gist: createTestGistConfig().gist,
    };

    (readJson as any).mockResolvedValue(testConfig);
    mockCtx.ui.select.mockResolvedValue('GitHub Gist');

    registerBackupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.select).toHaveBeenCalledWith('Select backup target:', [
      'WebDAV',
      'GitHub Gist',
    ]);
  });
});

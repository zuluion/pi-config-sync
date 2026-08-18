import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCloudSetupCommand, registerCloudStatusCommand } from '../../commands/cloud-setup';
import { createMockExtensionAPI, createMockContext, createTestWebDAVConfig, createTestGistConfig } from '../factories';
import { FileError, ErrorCodes } from '../../types';

// Mock dependencies
vi.mock('../../helpers', () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  CONFIG_FILE: '/mock/config.json',
}));

vi.mock('../../cloud/webdav', () => ({
  validateWebDAVConfig: vi.fn((config) => {
    return config && config.url && config.username && config.password;
  }),
}));

vi.mock('../../cloud/gist', () => ({
  validateGistConfig: vi.fn((config) => {
    return config && config.token && config.token.length > 0;
  }),
}));

describe('Cloud Setup Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
    vi.clearAllMocks();
  });

  it('should register config-cloud-setup command', () => {
    registerCloudSetupCommand(mockPi as any);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      'config-cloud-setup',
      expect.objectContaining({
        description: expect.stringContaining('Configure'),
      })
    );
  });

  it('should register config-cloud-status command', () => {
    registerCloudStatusCommand(mockPi as any);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      'config-cloud-status',
      expect.objectContaining({
        description: expect.stringContaining('Show'),
      })
    );
  });

  it('should show provider selection in cloud-setup', async () => {
    registerCloudSetupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.select).toHaveBeenCalled();
  });

  it('should configure WebDAV provider', async () => {
    const { readJson } = await import('../../helpers');
    (readJson as any).mockRejectedValue(new Error('File not found'));
    
    registerCloudSetupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;

    // Mock user inputs
    mockCtx.ui.select.mockResolvedValue('WebDAV');
    mockCtx.ui.input
      .mockResolvedValueOnce('https://dav.example.com/dav/')
      .mockResolvedValueOnce('testuser')
      .mockResolvedValueOnce('testpass')
      .mockResolvedValueOnce('/pi-config-backup.json');

    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('WebDAV configured'),
      'info'
    );
  });

  it('should configure Gist provider', async () => {
    const { readJson } = await import('../../helpers');
    (readJson as any).mockRejectedValue(new Error('File not found'));
    
    registerCloudSetupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;

    // Mock user inputs
    mockCtx.ui.select.mockResolvedValue('GitHub Gist');
    mockCtx.ui.input.mockResolvedValueOnce('ghp_test1234567890');

    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Gist configured'),
      'info'
    );
  });

  it('should handle user cancellation in cloud-setup', async () => {
    registerCloudSetupCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;

    mockCtx.ui.select.mockResolvedValue(undefined);

    await handler(undefined, mockCtx);

    // Should not proceed with configuration
    expect(mockCtx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining('configured'),
      'info'
    );
  });
});

describe('Cloud Status Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
    vi.clearAllMocks();
  });

  it('should show no config message when not configured', async () => {
    const { readJson } = await import('../../helpers');
    (readJson as any).mockRejectedValue(new FileError('File not found', ErrorCodes.FILE_NOT_FOUND));

    registerCloudStatusCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('No cloud provider'),
      'info'
    );
  });

  it('should show WebDAV configuration', async () => {
    const { readJson } = await import('../../helpers');
    const testConfig = createTestWebDAVConfig();

    (readJson as any).mockResolvedValue(testConfig);

    registerCloudStatusCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Default backup target: webdav'),
      'info'
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('── WebDAV ──'),
      'info'
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('URL: https://dav.example.com/dav/'),
      'info'
    );
  });

  it('should show Gist configuration', async () => {
    const { readJson } = await import('../../helpers');
    const testConfig = createTestGistConfig();

    (readJson as any).mockResolvedValue(testConfig);

    registerCloudStatusCommand(mockPi as any);
    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Default backup target: gist'),
      'info'
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('── GitHub Gist ──'),
      'info'
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Token: ghp_'),
      'info'
    );
  });
});
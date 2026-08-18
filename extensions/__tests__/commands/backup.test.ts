import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerBackupCommand } from '../../commands/backup';
import { createMockExtensionAPI, createMockContext } from '../factories';

describe('Backup Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
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
    registerBackupCommand(mockPi as any);

    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('No cloud provider'),
      'error'
    );
  });
});
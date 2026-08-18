import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerImportCommand } from '../../commands/import';
import { createMockExtensionAPI, createMockContext } from '../factories';

describe('Import Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
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
    registerImportCommand(mockPi as any);

    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
      'error'
    );
  });
});
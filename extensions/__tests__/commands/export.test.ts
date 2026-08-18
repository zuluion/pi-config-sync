import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerExportCommand } from '../../commands/export';
import { createMockExtensionAPI, createMockContext } from '../factories';

describe('Export Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
  });

  it('should register export-config command', () => {
    registerExportCommand(mockPi as any);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      'export-config',
      expect.objectContaining({
        description: expect.stringContaining('Export'),
      })
    );
  });

  it('should call handler with correct arguments', async () => {
    registerExportCommand(mockPi as any);

    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalled();
  });
});
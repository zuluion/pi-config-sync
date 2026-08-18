import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCloudSetupCommand, registerCloudStatusCommand } from '../../commands/cloud-setup';
import { createMockExtensionAPI, createMockContext } from '../factories';

describe('Cloud Setup Command', () => {
  let mockPi: ReturnType<typeof createMockExtensionAPI>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockPi = createMockExtensionAPI();
    mockCtx = createMockContext();
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

  it('should show no config message in cloud-status when not configured', async () => {
    registerCloudStatusCommand(mockPi as any);

    const handler = mockPi.registerCommand.mock.calls[0][1].handler;
    await handler(undefined, mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('No cloud provider'),
      'info'
    );
  });
});
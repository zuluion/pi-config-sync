/**
 * Test factories for pi-config-sync
 */

import { vi } from 'vitest';
import type { BackupData, CloudConfig, BackupHistoryRecord } from '../types';

// ─── Backup Data Factory ─────────────────────────────────────────────────────

export function createTestBackupData(
  overrides?: Partial<BackupData>
): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { theme: 'dark', packages: ['test-package'] },
    packages: ['test-package'],
    files: {},
    ...overrides,
  };
}

// ─── Cloud Config Factory ────────────────────────────────────────────────────

export function createTestWebDAVConfig(
  overrides?: Partial<CloudConfig['webdav']>
): CloudConfig {
  return {
    provider: 'webdav',
    webdav: {
      url: 'https://dav.example.com/dav/',
      username: 'testuser',
      password: 'testpass',
      remotePath: 'Pi-Config-Sync',
      deviceName: 'pi-config',
      ...overrides,
    },
  };
}

export function createTestGistConfig(
  overrides?: Partial<CloudConfig['gist']>
): CloudConfig {
  return {
    provider: 'gist',
    gist: {
      token: 'ghp_test1234567890',
      gistId: 'test-gist-id',
      filename: 'pi-config-backup.json',
      ...overrides,
    },
  };
}

export function createTestCloudConfig(
  overrides?: Partial<CloudConfig>
): CloudConfig {
  return {
    ...createTestWebDAVConfig(),
    ...overrides,
  };
}

// ─── Settings Factory ────────────────────────────────────────────────────────

export function createTestSettings(
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  return {
    theme: 'dark',
    packages: ['package1', 'package2'],
    ...overrides,
  };
}

// ─── History Record Factory ──────────────────────────────────────────────────

export function createTestHistoryRecord(
  overrides?: Partial<BackupHistoryRecord>
): Omit<BackupHistoryRecord, 'id'> {
  return {
    timestamp: new Date().toISOString(),
    source: 'local',
    status: 'success',
    fileCount: 5,
    packageCount: 3,
    ...overrides,
  };
}

// ─── Mock Factories ──────────────────────────────────────────────────────────

export function createMockExtensionAPI() {
  return {
    registerCommand: vi.fn(),
    exec: vi.fn().mockResolvedValue({ code: 0, stderr: '' }),
  };
}

export function createMockContext() {
  return {
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      select: vi.fn(),
      input: vi.fn(),
    },
  };
}
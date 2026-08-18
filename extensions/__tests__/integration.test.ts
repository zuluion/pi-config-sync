/**
 * Integration tests for pi-config-sync
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupHistoryManager } from '../history';
import { collectFiles, restoreFiles } from '../file-collector';
import { readSettings, extractPackages, filterSettings, toBase64, fromBase64 } from '../helpers';
import { createTestBackupData, createTestSettings } from './factories';

describe('Integration Tests', () => {
  describe('Backup and Restore Flow', () => {
    it('should create valid backup data structure', () => {
      const backupData = createTestBackupData({
        settings: createTestSettings(),
        files: {
          'settings.json': toBase64(JSON.stringify(createTestSettings())),
          'extensions/test.ts': toBase64('export default {}'),
        },
      });

      expect(backupData.version).toBe(1);
      expect(backupData.exportedAt).toBeDefined();
      expect(backupData.settings).toBeDefined();
      expect(backupData.packages).toBeDefined();
      expect(backupData.files).toBeDefined();
    });

    it('should encode and decode file content correctly', () => {
      const originalContent = 'export default { theme: "dark" }';
      const encoded = toBase64(originalContent);
      const decoded = fromBase64(encoded);

      expect(decoded).toBe(originalContent);
    });

    it('should handle backup history correctly', async () => {
      const testDir = join(tmpdir(), 'pi-history-integration-test');
      mkdirSync(testDir, { recursive: true });

      try {
        const historyManager = new BackupHistoryManager(
          join(testDir, 'backup-history.json')
        );

        // Add multiple records
        for (let i = 0; i < 5; i++) {
          await historyManager.addRecord({
            timestamp: new Date().toISOString(),
            source: i % 2 === 0 ? 'webdav' : 'gist',
            status: 'success',
            fileCount: i + 1,
            packageCount: i,
          });
        }

        // Verify records
        const records = await historyManager.getRecords();
        expect(records).toHaveLength(5);

        // Verify stats
        const stats = await historyManager.getStats();
        expect(stats.total).toBe(5);
        expect(stats.success).toBe(5);
        expect(stats.failed).toBe(0);

        // Verify cleanup (add more than 30 records)
        for (let i = 0; i < 30; i++) {
          await historyManager.addRecord({
            timestamp: new Date().toISOString(),
            source: 'local',
            status: 'success',
            fileCount: 1,
            packageCount: 1,
          });
        }

        const allRecords = await historyManager.getRecords();
        expect(allRecords).toHaveLength(30);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Settings Operations', () => {
    it('should filter settings correctly', () => {
      const settings = {
        lastChangelogVersion: '1.0',
        trackingId: 'abc123',
        enableAnalytics: true,
        theme: 'dark',
        packages: ['pkg1', 'pkg2'],
      };

      const filtered = filterSettings(settings);
      expect(filtered).toEqual({
        theme: 'dark',
        packages: ['pkg1', 'pkg2'],
      });
    });

    it('should extract packages correctly', () => {
      const settings = {
        packages: ['pkg1', { source: 'pkg2' }, 'pkg3'],
      };

      const packages = extractPackages(settings);
      expect(packages).toEqual(['pkg1', 'pkg2', 'pkg3']);
    });
  });

  describe('Base64 Operations', () => {
    it('should encode and decode correctly', () => {
      const original = 'Hello, World! 🌍';
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);

      expect(decoded).toBe(original);
    });

    it('should handle empty strings', () => {
      expect(toBase64('')).toBe('');
      expect(fromBase64('')).toBe('');
    });

    it('should handle large content', () => {
      const largeContent = 'x'.repeat(10000);
      const encoded = toBase64(largeContent);
      const decoded = fromBase64(encoded);

      expect(decoded).toBe(largeContent);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing files gracefully', async () => {
      // This test demonstrates error handling
      // In real scenario, collectFiles would handle missing files
      const files = {
        'nonexistent/file.txt': toBase64('content'),
      };

      // Should not throw
      const count = await restoreFiles(files);
      expect(count).toBe(1);
    });

    it('should handle invalid base64 gracefully', () => {
      // Should not throw
      const decoded = fromBase64('invalid-base64');
      expect(typeof decoded).toBe('string');
    });
  });
});
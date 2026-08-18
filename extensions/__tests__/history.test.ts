import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupHistoryManager } from '../history';
import type { BackupHistoryRecord } from '../types';

describe('BackupHistoryManager', () => {
  const testDir = join(tmpdir(), 'pi-history-test');
  const historyPath = join(testDir, 'backup-history.json');
  let manager: BackupHistoryManager;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    manager = new BackupHistoryManager(historyPath);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('addRecord', () => {
    it('should add a new record', async () => {
      const record: Omit<BackupHistoryRecord, 'id'> = {
        timestamp: new Date().toISOString(),
        source: 'local',
        status: 'success',
        fileCount: 5,
        packageCount: 3,
      };

      const result = await manager.addRecord(record);

      expect(result).toMatchObject(record);
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should prepend new records', async () => {
      const record1: Omit<BackupHistoryRecord, 'id'> = {
        timestamp: '2026-01-01T00:00:00.000Z',
        source: 'local',
        status: 'success',
        fileCount: 5,
        packageCount: 3,
      };

      const record2: Omit<BackupHistoryRecord, 'id'> = {
        timestamp: '2026-01-02T00:00:00.000Z',
        source: 'webdav',
        status: 'success',
        fileCount: 10,
        packageCount: 5,
      };

      await manager.addRecord(record1);
      await manager.addRecord(record2);

      const records = await manager.getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].source).toBe('webdav');
      expect(records[1].source).toBe('local');
    });

    it('should limit records to MAX_RECORDS', async () => {
      // Add 35 records
      for (let i = 0; i < 35; i++) {
        await manager.addRecord({
          timestamp: new Date().toISOString(),
          source: 'local',
          status: 'success',
          fileCount: i,
          packageCount: i,
        });
      }

      const records = await manager.getRecords();
      expect(records).toHaveLength(30);
    });

    it('should persist to file', async () => {
      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'gist',
        status: 'success',
        fileCount: 1,
        packageCount: 1,
      });

      // Create new manager instance to verify persistence
      const newManager = new BackupHistoryManager(historyPath);
      const records = await newManager.getRecords();
      expect(records).toHaveLength(1);
    });
  });

  describe('getRecords', () => {
    it('should return empty array when no records', async () => {
      const records = await manager.getRecords();
      expect(records).toEqual([]);
    });

    it('should return all records when no limit', async () => {
      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'local',
        status: 'success',
        fileCount: 1,
        packageCount: 1,
      });

      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'webdav',
        status: 'success',
        fileCount: 2,
        packageCount: 2,
      });

      const records = await manager.getRecords();
      expect(records).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.addRecord({
          timestamp: new Date().toISOString(),
          source: 'local',
          status: 'success',
          fileCount: i,
          packageCount: i,
        });
      }

      const records = await manager.getRecords(3);
      expect(records).toHaveLength(3);
    });
  });

  describe('getRecord', () => {
    it('should return record by id', async () => {
      const result = await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'local',
        status: 'success',
        fileCount: 1,
        packageCount: 1,
      });

      const record = await manager.getRecord(result.id);
      expect(record).toBeDefined();
      expect(record?.id).toBe(result.id);
    });

    it('should return undefined for non-existent id', async () => {
      const record = await manager.getRecord('non-existent-id');
      expect(record).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all records', async () => {
      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'local',
        status: 'success',
        fileCount: 1,
        packageCount: 1,
      });

      await manager.clear();

      const records = await manager.getRecords();
      expect(records).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'local',
        status: 'success',
        fileCount: 1,
        packageCount: 1,
      });

      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'webdav',
        status: 'failed',
        fileCount: 0,
        packageCount: 0,
        error: 'Network error',
      });

      await manager.addRecord({
        timestamp: new Date().toISOString(),
        source: 'gist',
        status: 'success',
        fileCount: 2,
        packageCount: 2,
      });

      const stats = await manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.lastBackup).toBeDefined();
    });

    it('should handle empty history', async () => {
      const stats = await manager.getStats();
      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.lastBackup).toBeUndefined();
    });
  });
});
/**
 * Backup history management for pi-config-sync
 */

import { rename } from 'node:fs/promises';
import { HISTORY_FILE, readJson, writeJson } from './helpers';
import type { BackupHistory, BackupHistoryRecord } from './types';

// ─── History Manager ─────────────────────────────────────────────────────────

const MAX_RECORDS = 30;

export class BackupHistoryManager {
  private historyPath: string;

  constructor(historyPath: string = HISTORY_FILE) {
    this.historyPath = historyPath;
  }

  async addRecord(
    record: Omit<BackupHistoryRecord, 'id'>
  ): Promise<BackupHistoryRecord> {
    const history = await this.load();
    const newRecord: BackupHistoryRecord = {
      ...record,
      id: this.generateId(),
    };

    history.records.unshift(newRecord);

    // Clean old records
    if (history.records.length > MAX_RECORDS) {
      history.records = history.records.slice(0, MAX_RECORDS);
    }

    history.lastUpdated = new Date().toISOString();
    await this.save(history);

    return newRecord;
  }

  async getRecords(limit?: number): Promise<BackupHistoryRecord[]> {
    const history = await this.load();
    return limit ? history.records.slice(0, limit) : history.records;
  }

  async getRecord(id: string): Promise<BackupHistoryRecord | undefined> {
    const history = await this.load();
    return history.records.find((r) => r.id === id);
  }

  async clear(): Promise<void> {
    await this.save({
      records: [],
      lastUpdated: new Date().toISOString(),
    });
  }

  async getStats(): Promise<{
    total: number;
    success: number;
    failed: number;
    lastBackup?: string;
  }> {
    const history = await this.load();
    const success = history.records.filter((r) => r.status === 'success').length;
    const failed = history.records.filter((r) => r.status === 'failed').length;
    const lastBackup = history.records[0]?.timestamp;

    return {
      total: history.records.length,
      success,
      failed,
      lastBackup,
    };
  }

  private async load(): Promise<BackupHistory> {
    try {
      return await readJson<BackupHistory>(this.historyPath);
    } catch {
      return { records: [], lastUpdated: new Date().toISOString() };
    }
  }

  private async save(history: BackupHistory): Promise<void> {
    const tempPath = `${this.historyPath}.tmp`;
    await writeJson(tempPath, history);
    await rename(tempPath, this.historyPath);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readJson,
  writeJson,
  readSettings,
  extractPackages,
  filterSettings,
  toBase64,
  fromBase64,
  calculateChecksum,
  withRetry,
} from '../helpers';
import { FileError, ErrorCodes, AppError } from '../types';

describe('File Operations', () => {
  const testDir = join(tmpdir(), 'pi-config-sync-test');
  const testFile = join(testDir, 'test.json');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('readJson', () => {
    it('should read and parse JSON file', async () => {
      const data = { name: 'test', version: 1 };
      writeFileSync(testFile, JSON.stringify(data), 'utf-8');

      const result = await readJson<{ name: string; version: number }>(testFile);
      expect(result).toEqual(data);
    });

    it('should throw FileError for missing file', async () => {
      const missingFile = join(testDir, 'missing.json');
      await expect(readJson(missingFile)).rejects.toThrow(FileError);
      await expect(readJson(missingFile)).rejects.toMatchObject({
        code: ErrorCodes.FILE_NOT_FOUND,
      });
    });
  });

  describe('writeJson', () => {
    it('should write JSON to file', async () => {
      const data = { name: 'test', items: [1, 2, 3] };
      await writeJson(testFile, data);

      const content = JSON.parse(
        require('node:fs').readFileSync(testFile, 'utf-8')
      );
      expect(content).toEqual(data);
    });

    it('should create directories if they do not exist', async () => {
      const nestedFile = join(testDir, 'nested', 'deep', 'file.json');
      await writeJson(nestedFile, { nested: true });

      expect(existsSync(nestedFile)).toBe(true);
    });
  });
});

describe('Settings Operations', () => {
  describe('extractPackages', () => {
    it('should extract string packages', () => {
      const settings = { packages: ['pkg1', 'pkg2', 'pkg3'] };
      expect(extractPackages(settings)).toEqual(['pkg1', 'pkg2', 'pkg3']);
    });

    it('should extract packages with source field', () => {
      const settings = {
        packages: [{ source: 'pkg1' }, { source: 'pkg2' }],
      };
      expect(extractPackages(settings)).toEqual(['pkg1', 'pkg2']);
    });

    it('should handle mixed package formats', () => {
      const settings = {
        packages: ['pkg1', { source: 'pkg2' }, 'pkg3'],
      };
      expect(extractPackages(settings)).toEqual(['pkg1', 'pkg2', 'pkg3']);
    });

    it('should return empty array for missing packages', () => {
      expect(extractPackages({})).toEqual([]);
    });

    it('should return empty array for non-array packages', () => {
      expect(extractPackages({ packages: 'not-array' })).toEqual([]);
    });
  });

  describe('filterSettings', () => {
    it('should filter out skip keys', () => {
      const settings = {
        lastChangelogVersion: '1.0',
        trackingId: 'abc123',
        enableAnalytics: true,
        theme: 'dark',
        packages: ['pkg1'],
      };

      const result = filterSettings(settings);
      expect(result).toEqual({
        theme: 'dark',
        packages: ['pkg1'],
      });
    });

    it('should keep all keys if none are skipped', () => {
      const settings = { theme: 'dark', fontSize: 14 };
      const result = filterSettings(settings);
      expect(result).toEqual(settings);
    });

    it('should return empty object for empty input', () => {
      expect(filterSettings({})).toEqual({});
    });
  });
});

describe('Base64 Operations', () => {
  describe('toBase64', () => {
    it('should encode text to base64', () => {
      expect(toBase64('hello')).toBe('aGVsbG8=');
      expect(toBase64('Hello, 世界!')).toBe('SGVsbG8sIOS4lueVjCE=');
    });

    it('should handle empty string', () => {
      expect(toBase64('')).toBe('');
    });
  });

  describe('fromBase64', () => {
    it('should decode base64 to text', () => {
      expect(fromBase64('aGVsbG8=')).toBe('hello');
      expect(fromBase64('SGVsbG8sIOS4lueVjCE=')).toBe('Hello, 世界!');
    });

    it('should handle empty string', () => {
      expect(fromBase64('')).toBe('');
    });
  });

  describe('roundtrip', () => {
    it('should preserve text through encode/decode', () => {
      const original = 'Hello, World! 🌍';
      expect(fromBase64(toBase64(original))).toBe(original);
    });
  });
});

describe('Checksum Operations', () => {
  describe('calculateChecksum', () => {
    it('should calculate consistent checksum', () => {
      const data = {
        version: 1 as const,
        exportedAt: '2026-01-01T00:00:00.000Z',
        settings: { theme: 'dark' },
        packages: ['pkg1'],
        files: {},
      };

      const checksum1 = calculateChecksum(data);
      const checksum2 = calculateChecksum(data);
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 hex length
    });

    it('should produce different checksums for different data', () => {
      const data1 = {
        version: 1 as const,
        exportedAt: '2026-01-01T00:00:00.000Z',
        settings: { theme: 'dark' },
        packages: ['pkg1'],
        files: {},
      };

      const data2 = {
        version: 1 as const,
        exportedAt: '2026-01-01T00:00:00.000Z',
        settings: { theme: 'light' },
        packages: ['pkg1'],
        files: {},
      };

      expect(calculateChecksum(data1)).not.toBe(calculateChecksum(data2));
    });
  });
});

describe('Retry Logic', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'success';
      };

      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on retryable error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Network error') as AppError;
          error.code = ErrorCodes.CLOUD_NETWORK_ERROR;
          throw error;
        }
        return 'success';
      };

      const result = await withRetry(fn, {
        maxRetries: 3,
        retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR],
      });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max retries', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('Network error') as AppError;
        error.code = ErrorCodes.CLOUD_NETWORK_ERROR;
        throw error;
      };

      await expect(
        withRetry(fn, {
          maxRetries: 2,
          retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR],
        })
      ).rejects.toThrow();
      expect(attempts).toBe(3); // initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error('Non-retryable error');
      };

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
        'Non-retryable error'
      );
      expect(attempts).toBe(1);
    });
  });
});
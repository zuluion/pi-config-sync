import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  webdavUpload,
  webdavDownload,
  webdavList,
  generateBackupFilename,
  validateWebDAVConfig,
} from '../../cloud/webdav';
import { WebDAVError, ErrorCodes, AppError } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WebDAV Adapter', () => {
  const config = {
    url: 'https://dav.example.com/dav/',
    username: 'testuser',
    password: 'testpass',
    remotePath: 'Pi-Config-Sync',
    deviceName: 'pi-config',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Upload ──────────────────────────────────────────────────────────────

  describe('webdavUpload', () => {
    it('should upload data with generated filename', async () => {
      // Mock MKCOL (directory creation)
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Mock PUT (upload)
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(
        webdavUpload(config, 'test data', 'backup_28800_2026-08-17_14:30:00.json')
      ).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify PUT URL includes the filename
      const putCall = mockFetch.mock.calls[1];
      expect(putCall[0]).toContain('Pi-Config-Sync/backup_28800_2026-08-17_14:30:00.json');
    });

    it('should use default filename when not provided', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(webdavUpload(config, 'test data')).resolves.toBeUndefined();

      const putCall = mockFetch.mock.calls[1];
      expect(putCall[0]).toContain('pi-config-backup.json');
    });

    it('should handle legacy remotePath (bare filename)', async () => {
      const legacyConfig = {
        ...config,
        remotePath: '/pi-config-backup.json',
      };

      // No MKCOL for legacy config (no directory detected)
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(
        webdavUpload(legacyConfig, 'test data', 'backup.json')
      ).resolves.toBeUndefined();

      // Should only have PUT call (no MKCOL)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 503 error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(webdavUpload(config, 'test data')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(3); // MKCOL + 2x PUT
    });

    it('should throw WebDAVError on auth failure without retry', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(webdavUpload(config, 'test data')).rejects.toThrow(
        WebDAVError
      );
    });
  });

  // ─── Download ────────────────────────────────────────────────────────────

  describe('webdavDownload', () => {
    it('should download data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('downloaded data'),
      });

      const result = await webdavDownload(config);
      expect(result).toBe('downloaded data');
    });

    it('should download specific file by path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('specific file data'),
      });

      const result = await webdavDownload(
        config,
        'Pi-Config-Sync/my-backup.json'
      );
      expect(result).toBe('specific file data');

      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain('Pi-Config-Sync/my-backup.json');
    });

    it('should throw WebDAVError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(webdavDownload(config)).rejects.toThrow(WebDAVError);
    });

    it('should retry on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('downloaded data'),
      });

      const result = await webdavDownload(config);
      expect(result).toBe('downloaded data');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Directory Listing ───────────────────────────────────────────────────

  describe('webdavList', () => {
    const createPROPFINDResponse = (files: Array<{
      href: string;
      lastModified?: string;
      size?: number;
    }>) => {
      const responses = files
        .map(
          (f) => `<d:response>
          <d:href>${f.href}</d:href>
          <d:propstat>
            <d:prop>
              ${f.lastModified ? `<d:getlastmodified>${f.lastModified}</d:getlastmodified>` : ''}
              ${f.size !== undefined ? `<d:getcontentlength>${f.size}</d:getcontentlength>` : ''}
            </d:prop>
          </d:propstat>
        </d:response>`
        )
        .join('');
      return `<?xml version="1.0" encoding="utf-8"?>
      <d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`;
    };

    it('should list JSON files in directory', async () => {
      const xml = createPROPFINDResponse([
        {
          href: '/Pi-Config-Sync/pi-config_28800_2026-08-17_14:30:00.json',
          lastModified: 'Mon, 17 Aug 2026 06:30:00 GMT',
          size: 12345,
        },
        {
          href: '/Pi-Config-Sync/pi-config_28800_2026-08-16_10:00:00.json',
          lastModified: 'Sun, 16 Aug 2026 02:00:00 GMT',
          size: 11000,
        },
        {
          href: '/Pi-Config-Sync/notes.txt',
          lastModified: 'Fri, 15 Aug 2026 12:00:00 GMT',
          size: 500,
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const files = await webdavList(config);

      // Should only include .json files
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('pi-config_28800_2026-08-17_14:30:00.json');
      expect(files[0].lastModified).toBe('Mon, 17 Aug 2026 06:30:00 GMT');
      expect(files[0].size).toBe(12345);
      expect(files[1].name).toBe('pi-config_28800_2026-08-16_10:00:00.json');
    });

    it('should sort files by name descending (newest first)', async () => {
      const xml = createPROPFINDResponse([
        { href: '/Pi-Config-Sync/backup_01.json' },
        { href: '/Pi-Config-Sync/backup_03.json' },
        { href: '/Pi-Config-Sync/backup_02.json' },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const files = await webdavList(config);

      expect(files[0].name).toBe('backup_03.json');
      expect(files[1].name).toBe('backup_02.json');
      expect(files[2].name).toBe('backup_01.json');
    });

    it('should skip directory itself from results', async () => {
      const xml = createPROPFINDResponse([
        { href: '/Pi-Config-Sync/' },
        { href: '/Pi-Config-Sync/backup.json' },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const files = await webdavList(config);

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('backup.json');
    });

    it('should throw WebDAVError on PROPFIND failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(webdavList(config)).rejects.toThrow(WebDAVError);
    });

    it('should handle empty directory', async () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
      <d:multistatus xmlns:d="DAV:"></d:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const files = await webdavList(config);
      expect(files).toHaveLength(0);
    });

    it('should use PROPFIND with Depth: 1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<d:multistatus xmlns:d="DAV:"></d:multistatus>'),
      });

      await webdavList(config);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].method).toBe('PROPFIND');
      expect(fetchCall[1].headers.Depth).toBe('1');
    });
  });

  // ─── Filename Generation ─────────────────────────────────────────────────

  describe('generateBackupFilename', () => {
    it('should generate filename with device name and timezone offset', () => {
      const filename = generateBackupFilename('my-pc');

      // Format: {deviceName}_{tzOffset}_{YYYY-MM-DD_HH:mm:ss}.json
      expect(filename).toMatch(/^my-pc_-?\d+_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}\.json$/);
    });

    it('should use default device name when not provided', () => {
      const filename = generateBackupFilename();

      expect(filename).toMatch(/^pi-config_-?\d+_/);
    });

    it('should include correct timezone offset', () => {
      const filename = generateBackupFilename('test');
      const tzOffset = new Date().getTimezoneOffset() * -60;

      expect(filename).toContain(`test_${tzOffset}_`);
    });

    it('should use local time components', () => {
      const now = new Date();
      const filename = generateBackupFilename('dev');
      const pad = (n: number) => String(n).padStart(2, '0');

      expect(filename).toContain(`${now.getFullYear()}-`);
      expect(filename).toContain(`${pad(now.getMonth() + 1)}-`);
      expect(filename).toContain(`${pad(now.getDate())}_`);
      expect(filename).toContain(`${pad(now.getHours())}:`);
      expect(filename).toContain(`${pad(now.getMinutes())}:`);
      expect(filename).toContain(`${pad(now.getSeconds())}.json`);
    });

    it('should produce different filenames at different times', async () => {
      const filename1 = generateBackupFilename('test');
      // Wait 1ms to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1100));
      const filename2 = generateBackupFilename('test');

      // Filenames should differ (at least the seconds part)
      expect(filename1).not.toBe(filename2);
    });
  });

  // ─── Validate Config ─────────────────────────────────────────────────────

  describe('validateWebDAVConfig', () => {
    it('should return true for valid config', () => {
      expect(validateWebDAVConfig(config)).toBe(true);
    });

    it('should return true without deviceName (optional)', () => {
      const configWithoutDevice = {
        url: 'https://dav.example.com/dav/',
        username: 'user',
        password: 'pass',
      };
      expect(validateWebDAVConfig(configWithoutDevice)).toBe(true);
    });

    it('should return false for invalid config', () => {
      expect(validateWebDAVConfig(null)).toBe(false);
      expect(validateWebDAVConfig({})).toBe(false);
      expect(validateWebDAVConfig({ url: 'test' })).toBe(false);
      expect(validateWebDAVConfig({ url: '', username: '', password: '' })).toBe(
        false
      );
    });
  });
});

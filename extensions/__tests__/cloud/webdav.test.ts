import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webdavUpload, webdavDownload, validateWebDAVConfig } from '../../cloud/webdav';
import { WebDAVError, ErrorCodes, AppError } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WebDAV Adapter', () => {
  const config = {
    url: 'https://dav.example.com/dav/',
    username: 'testuser',
    password: 'testpass',
    remotePath: '/pi-config-backup.json',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('webdavUpload', () => {
    it('should upload data successfully', async () => {
      // Mock MKCOL (directory creation)
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Mock PUT (upload)
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(webdavUpload(config, 'test data')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should retry on 503 error', async () => {
      // Mock PUT 返回 503
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      // Mock 重试后成功
      mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

      await expect(webdavUpload(config, 'test data')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2); // 2x PUT
    });

    it('should throw WebDAVError on auth failure without retry', async () => {
      // Mock PUT 返回 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(webdavUpload(config, 'test data')).rejects.toThrow(WebDAVError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 1x PUT (no retry)
    });
  });

  describe('webdavDownload', () => {
    it('should download data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('downloaded data'),
      });

      const result = await webdavDownload(config);
      expect(result).toBe('downloaded data');
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
      // Mock 第一次请求失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // Mock 重试后成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('downloaded data'),
      });

      const result = await webdavDownload(config);
      expect(result).toBe('downloaded data');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateWebDAVConfig', () => {
    it('should return true for valid config', () => {
      expect(validateWebDAVConfig(config)).toBe(true);
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
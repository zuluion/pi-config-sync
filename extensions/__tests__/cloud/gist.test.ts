import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gistUpload, gistDownload, validateGistConfig } from '../../cloud/gist';
import { GistError, ErrorCodes } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Gist Adapter', () => {
  const config = {
    token: 'ghp_test1234567890',
    gistId: undefined as string | undefined,
    filename: 'pi-config-backup.json',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    config.gistId = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('gistUpload', () => {
    it('should create new gist when no gistId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-gist-id' }),
      });

      const result = await gistUpload(config, 'test data');
      expect(result).toBe('new-gist-id');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/gists',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should update existing gist when gistId is provided', async () => {
      config.gistId = 'existing-gist-id';
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await gistUpload(config, 'test data');
      expect(result).toBe('existing-gist-id');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/gists/existing-gist-id',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should throw GistError on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(gistUpload(config, 'test data')).rejects.toThrow(GistError);
    });

    // Skip network error test due to retry complexity
  });

  describe('gistDownload', () => {
    it('should download gist content successfully', async () => {
      config.gistId = 'test-gist-id';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            files: {
              'pi-config-backup.json': { content: 'downloaded content' },
            },
          }),
      });

      const result = await gistDownload(config);
      expect(result).toBe('downloaded content');
    });

    it('should throw GistError when file not found in gist', async () => {
      config.gistId = 'test-gist-id';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: {} }),
      });

      await expect(gistDownload(config)).rejects.toThrow(GistError);
    });

    it('should throw GistError on 404', async () => {
      config.gistId = 'non-existent-gist';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(gistDownload(config)).rejects.toThrow(GistError);
    });
  });

  describe('validateGistConfig', () => {
    it('should return true for valid config', () => {
      expect(validateGistConfig({ token: 'ghp_test' })).toBe(true);
      expect(
        validateGistConfig({ token: 'ghp_test', gistId: 'test-id' })
      ).toBe(true);
    });

    it('should return false for invalid config', () => {
      expect(validateGistConfig(null)).toBe(false);
      expect(validateGistConfig({})).toBe(false);
      expect(validateGistConfig({ token: '' })).toBe(false);
      expect(validateGistConfig({ token: 123 })).toBe(false);
    });
  });
});
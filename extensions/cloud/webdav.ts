/**
 * WebDAV adapter for pi-config-sync
 */

import type { CloudConfig, WebDAVConfig } from '../types';
import { WebDAVError, ErrorCodes } from '../types';
import { withRetry } from '../helpers';

// ─── WebDAV Operations ───────────────────────────────────────────────────────

export async function webdavRequest(
  config: WebDAVConfig,
  method: string,
  path: string,
  body?: string
): Promise<Response> {
  const base = config.url.replace(/\/+$/, '');
  const remotePath = (config.remotePath || '/pi-config-backup.json').replace(
    /^\/+/,
    ''
  );
  const url = `${base}/${remotePath}${path ? `/${path}` : ''}`;

  const headers: Record<string, string> = {
    Authorization:
      'Basic ' +
      Buffer.from(`${config.username}:${config.password}`).toString('base64'),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  try {
    return await fetch(url, { method, headers, body });
  } catch (err) {
    throw new WebDAVError(
      `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ErrorCodes.CLOUD_NETWORK_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

export async function webdavUpload(
  config: WebDAVConfig,
  data: string
): Promise<void> {
  // Ensure remote directory exists (MKCOL)
  const remoteDir = (config.remotePath || '/pi-config-backup.json')
    .replace(/\/[^/]+$/, '')
    .replace(/^\/+/, '');
  if (remoteDir) {
    const base = config.url.replace(/\/+$/, '');
    const dirUrl = `${base}/${remoteDir}`;
    try {
      await fetch(dirUrl, {
        method: 'MKCOL',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${config.username}:${config.password}`).toString(
              'base64'
            ),
        },
      });
    } catch {
      // directory may already exist
    }
  }

  const res = await withRetry(() => webdavRequest(config, 'PUT', '', data), {
    retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR],
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new WebDAVError(
        `Authentication failed: ${res.status} ${res.statusText}`,
        ErrorCodes.CLOUD_AUTH_FAILED
      );
    }
    throw new WebDAVError(
      `Upload failed: ${res.status} ${res.statusText}`,
      ErrorCodes.CLOUD_NETWORK_ERROR
    );
  }
}

export async function webdavDownload(config: WebDAVConfig): Promise<string> {
  const res = await withRetry(() => webdavRequest(config, 'GET', ''), {
    retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR],
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new WebDAVError(
        `Authentication failed: ${res.status} ${res.statusText}`,
        ErrorCodes.CLOUD_AUTH_FAILED
      );
    }
    if (res.status === 404) {
      throw new WebDAVError(
        `File not found: ${res.statusText}`,
        ErrorCodes.CLOUD_NOT_FOUND
      );
    }
    throw new WebDAVError(
      `Download failed: ${res.status} ${res.statusText}`,
      ErrorCodes.CLOUD_NETWORK_ERROR
    );
  }

  return res.text();
}

// ─── Validate WebDAV Config ──────────────────────────────────────────────────

export function validateWebDAVConfig(config: unknown): config is WebDAVConfig {
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  return (
    typeof cfg.url === 'string' &&
    typeof cfg.username === 'string' &&
    typeof cfg.password === 'string' &&
    cfg.url.length > 0 &&
    cfg.username.length > 0 &&
    cfg.password.length > 0
  );
}
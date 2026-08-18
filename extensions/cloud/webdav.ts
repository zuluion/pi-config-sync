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
  let remotePath = (config.remotePath || '/pi-config-backup.json').replace(
    /^\/+/,
    ''
  );
  
  // 如果 remotePath 没有文件扩展名，自动添加默认文件名
  if (remotePath && !remotePath.includes('.')) {
    remotePath = `${remotePath}/pi-config-backup.json`;
  }
  
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
    const res = await fetch(url, { method, headers, body });
    
    // 将 HTTP 错误转换为可重试的异常
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
      // 5xx 和 429 为可重试错误
      throw new WebDAVError(
        `Request failed: ${res.status} ${res.statusText}`,
        ErrorCodes.CLOUD_NETWORK_ERROR
      );
    }
    
    return res;
  } catch (err) {
    if (err instanceof WebDAVError) throw err;
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
  let remoteDir = (config.remotePath || '/pi-config-backup.json')
    .replace(/^\/+/, '');
  
  // 提取目录部分
  if (remoteDir.includes('/')) {
    // remotePath 包含路径分隔符，提取目录部分
    remoteDir = remoteDir.replace(/\/[^/]+$/, '');
  } else if (remoteDir.includes('.')) {
    // remotePath 只是一个文件名（如 pi-config-backup.json），没有目录
    remoteDir = '';
  }
  // 否则 remoteDir 就是目录名本身（如 Pi-Config-Sync）
  
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

  await withRetry(() => webdavRequest(config, 'PUT', '', data));
}

export async function webdavDownload(config: WebDAVConfig): Promise<string> {
  const res = await withRetry(() => webdavRequest(config, 'GET', ''));
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
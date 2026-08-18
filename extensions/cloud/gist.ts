/**
 * GitHub Gist adapter for pi-config-sync
 */

import type { GistConfig } from '../types';
import { GistError, ErrorCodes } from '../types';
import { withRetry } from '../helpers';

// ─── Gist Operations ─────────────────────────────────────────────────────────

export async function gistHeaders(
  token: string
): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function gistRequest(
  url: string,
  method: string,
  token: string,
  body?: string
): Promise<Response> {
  const headers = await gistHeaders(token);
  
  try {
    const res = await fetch(url, { method, headers, body });
    
    // 将 HTTP 错误转换为可重试的异常
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new GistError(
          `Authentication failed: ${res.status}`,
          ErrorCodes.CLOUD_AUTH_FAILED
        );
      }
      if (res.status === 404) {
        throw new GistError(
          `Gist not found: ${res.statusText}`,
          ErrorCodes.CLOUD_NOT_FOUND
        );
      }
      // 5xx 和 429 为可重试错误
      throw new GistError(
        `Request failed: ${res.status}`,
        ErrorCodes.CLOUD_NETWORK_ERROR
      );
    }
    
    return res;
  } catch (err) {
    if (err instanceof GistError) throw err;
    throw new GistError(
      `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ErrorCodes.CLOUD_NETWORK_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

export async function gistUpload(
  config: GistConfig,
  data: string
): Promise<string> {
  const headers = await gistHeaders(config.token);
  const filename = config.filename || 'pi-config-backup.json';

  if (config.gistId) {
    // Update existing gist
    await withRetry(() =>
      gistRequest(
        `https://api.github.com/gists/${config.gistId}`,
        'PATCH',
        config.token,
        JSON.stringify({
          description: `Pi config backup — ${new Date().toISOString()}`,
          files: { [filename]: { content: data } },
        })
      )
    );
    return config.gistId;
  }

  // Create new gist
  const res = await withRetry(() =>
    gistRequest(
      'https://api.github.com/gists',
      'POST',
      config.token,
      JSON.stringify({
        description: 'Pi coding agent config backup',
        public: false,
        files: { [filename]: { content: data } },
      })
    )
  );
  const result = (await res.json()) as { id: string };
  return result.id;
}

export async function gistDownload(config: GistConfig): Promise<string> {
  const res = await withRetry(() =>
    gistRequest(
      `https://api.github.com/gists/${config.gistId}`,
      'GET',
      config.token
    )
  );
  const result = (await res.json()) as {
    files: Record<string, { content: string }>;
  };
  const filename = config.filename || 'pi-config-backup.json';
  const file = result.files[filename];
  if (!file) {
    throw new GistError(
      `File "${filename}" not found in gist`,
      ErrorCodes.CLOUD_NOT_FOUND
    );
  }
  return file.content;
}

// ─── Validate Gist Config ────────────────────────────────────────────────────

export function validateGistConfig(config: unknown): config is GistConfig {
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  return (
    typeof cfg.token === 'string' &&
    cfg.token.length > 0 &&
    (cfg.gistId === undefined || typeof cfg.gistId === 'string')
  );
}
# pi-config-sync 项目修改方案

基于质量分析报告，按优先级分三个阶段实施修改。

---

## 阶段一：安全性与核心 Bug 修复（最高优先级）

### 1. 修复路径穿越漏洞 (BUG-01)

**文件**: `extensions/file-collector.ts`

**修改内容**: 在 `restoreFiles` 函数中增加路径校验

```typescript
import { resolve } from 'node:path';

export async function restoreFiles(files: Record<string, string>): Promise<number> {
  let count = 0;
  
  const promises = Object.entries(files).map(async ([relPath, b64Content]) => {
    const absPath = join(PI_AGENT, relPath);
    const normalizedPath = resolve(absPath);
    const normalizedBase = resolve(PI_AGENT);
    
    // 校验路径是否逃逸出 PI_AGENT 目录
    if (!normalizedPath.startsWith(normalizedBase + '/') && normalizedPath !== normalizedBase) {
      throw new FileError(
        `Invalid path traversal detected: ${relPath}`,
        ErrorCodes.FILE_PERMISSION_ERROR
      );
    }
    
    try {
      await mkdir(join(absPath, '..'), { recursive: true });
      await writeFile(absPath, fromBase64(b64Content), 'utf-8');
      count++;
    } catch (err) {
      throw new FileError(
        `Failed to restore file: ${relPath}`,
        ErrorCodes.FILE_WRITE_ERROR,
        err instanceof Error ? err : undefined
      );
    }
  });

  await Promise.all(promises);
  return count;
}
```

---

### 2. 重构重试机制 (BUG-02)

**文件**: `extensions/helpers.ts`

**修改内容**: 
- 移除 `retryableErrors` 参数，改为通用的错误重试
- 修复 `setTimeout` 泄漏问题 (BUG-05)
- 重试所有 Error 类型，排除特定不可重试错误

```typescript
export interface RetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  retryableCheck?: (err: unknown) => boolean;
}

const DEFAULT_RETRYABLE = (err: unknown): boolean => {
  // 不重试认证错误、验证错误
  if (err instanceof AppError) {
    return ![ErrorCodes.CLOUD_AUTH_FAILED, ErrorCodes.VALIDATION_UNSUPPORTED_VERSION].includes(err.code);
  }
  // 网络错误、TypeError (fetch 失败) 可重试
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.message === 'TIMEOUT') return true;
  return false;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeoutMs = 30000,
    retryableCheck = DEFAULT_RETRYABLE,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const result = await fn();
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      
      const isLastAttempt = attempt === maxRetries;
      const shouldRetry = retryableCheck(err);

      if (isLastAttempt || !shouldRetry) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
```

**文件**: `extensions/cloud/webdav.ts` 和 `extensions/cloud/gist.ts`

**修改内容**: 将 HTTP 状态码检查移入请求函数内部

```typescript
// webdav.ts - webdavRequest 修改
export async function webdavRequest(
  config: WebDAVConfig,
  method: string,
  path: string,
  body?: string
): Promise<Response> {
  // ... 原有代码 ...
  
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

// webdavUpload/webdavDownload 简化，移除外部状态码检查
export async function webdavUpload(
  config: WebDAVConfig,
  data: string
): Promise<void> {
  // Ensure remote directory exists (MKCOL)
  // ... 保持不变 ...
  
  // withRetry 现在会捕获 webdavRequest 内部抛出的异常
  await withRetry(() => webdavRequest(config, 'PUT', '', data));
}
```

**文件**: `extensions/cloud/gist.ts` - 同样修改 `gistUpload` 和 `gistDownload`

---

### 3. 支持二进制文件无损备份 (BUG-03)

**文件**: `extensions/helpers.ts`

**修改内容**: 修改 Base64 编解码函数支持 Buffer

```typescript
export function toBase64(data: string | Buffer): string {
  if (Buffer.isBuffer(data)) {
    return data.toString('base64');
  }
  return Buffer.from(data, 'utf-8').toString('base64');
}

export function fromBase64(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}
```

**文件**: `extensions/file-collector.ts`

**修改内容**: 
- `collectFiles` 使用二进制读取
- `restoreFiles` 使用二进制写入

```typescript
// collectDir 中修改
} else if (entry.isFile()) {
  try {
    const content = await readFile(absPath); // 不指定编码，返回 Buffer
    files[relPath] = toBase64(content);
  } catch {
    // skip unreadable
  }
}

// restoreFiles 中修改
await writeFile(absPath, fromBase64(b64Content)); // Buffer 直接写入，不指定编码
```

---

### 4. 修复 Checksum 计算逻辑 (BUG-04)

**文件**: `extensions/helpers.ts`

**修改内容**: 将 files 纳入哈希计算

```typescript
export function calculateChecksum(data: BackupData): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(data.settings));
  hash.update(JSON.stringify(data.packages));
  
  // 对文件名排序以保证确定性哈希
  const sortedFiles = Object.keys(data.files || {}).sort();
  for (const key of sortedFiles) {
    hash.update(key);
    hash.update(data.files[key]);
  }
  
  return hash.digest('hex');
}
```

---

## 阶段二：架构精简与统一错误处理

### 5. 精简 error-handler.ts (BUG-07)

**文件**: `extensions/error-handler.ts`

**修改内容**:
- 移除脆弱的 `extractErrorInfo` 正则匹配
- 简化为直接使用 error.message

```typescript
function getErrorMessage(error: AppError): string {
  // 直接使用错误消息，不再尝试提取
  return error.message;
}

// 或者保留模板但简化提取逻辑
function getErrorMessage(error: AppError): string {
  const templateFn = ErrorMessages[error.code as keyof typeof ErrorMessages];
  if (templateFn) {
    // 直接从 message 提取参数，或者修改 Error 构造时携带 context
    // 简化方案：直接返回 error.message
    return error.message;
  }
  return `${error.name}: ${error.message}`;
}
```

**更好的方案**: 修改 Error 类构造函数，携带结构化上下文

```typescript
// types.ts
export class FileError extends AppError {
  public readonly filePath?: string;
  
  constructor(message: string, code: ErrorCode, options?: { filePath?: string; cause?: Error }) {
    super(message, code, options?.cause);
    this.name = 'FileError';
    this.filePath = options?.filePath;
  }
}

// 使用时
throw new FileError(
  `Failed to read file: ${path}`,
  ErrorCodes.FILE_READ_ERROR,
  { filePath: path, cause: err }
);
```

---

### 6. 清理死代码

**文件**: `extensions/commands/backup.ts`

**修改内容**:
- 移除未使用的 `handleCommandError` 和 `getErrorSuggestion` 导入
- 移除重复的 `writeJson` 动态导入

```typescript
// 移除这些行
import { handleCommandError, getErrorSuggestion } from '../error-handler';

// 移除重复的动态导入
const { writeJson } = await import('../helpers');
```

**文件**: `extensions/commands/cloud-setup.ts` - 同样移除未使用的导入

---

### 7. 规范化设置与文件还原顺序 (BUG-08)

**文件**: `extensions/commands/import.ts`

**修改内容**: 在 restoreFiles 时跳过 settings.json

```typescript
// 方案 A: 修改 restoreFiles 支持排除列表
export async function restoreFiles(
  files: Record<string, string>,
  excludePaths: string[] = []
): Promise<number> {
  let count = 0;
  
  const promises = Object.entries(files).map(async ([relPath, b64Content]) => {
    // 跳过排除的文件
    if (excludePaths.includes(relPath)) {
      return;
    }
    
    // ... 原有逻辑 ...
  });
  
  await Promise.all(promises);
  return count;
}

// 在 import.ts 中调用
const count = await restoreFiles(data.files, ['settings.json']);

// 方案 B: 在 collectFiles 时排除 settings.json
// 修改 BACKUP_TARGETS，移除 'settings.json'
// 但这会破坏向后兼容性，不推荐
```

---

### 8. 顶层命令异常保护 (BUG-06)

**文件**: `extensions/commands/export.ts`

**修改内容**: 添加 try-catch 包装

```typescript
export function registerExportCommand(pi: ExtensionAPI): void {
  pi.registerCommand('export-config', {
    description: 'Export settings + packages + custom files to local JSON',
    handler: async (args, ctx) => {
      try {
        const settings = await readSettings();
        const packages = extractPackages(settings);
        const files = await collectFiles();

        const data: BackupData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: filterSettings(settings),
          packages,
          files,
        };

        const outputPath = args?.trim() || join(homedir(), 'pi-config-backup.json');
        await writeJson(outputPath, data);

        const fileCount = Object.keys(files).length;
        ctx.ui.notify(
          [
            `✓ Exported to: ${outputPath}`,
            ``,
            `Packages: ${packages.length}`,
            `Custom files: ${fileCount}`,
            ...Object.keys(files).map((f) => `  • ${f}`),
            ``,
            `On new device: /import-config ${outputPath}`,
          ].join('\n'),
          'info'
        );
      } catch (err) {
        handleCommandError(ctx, err, 'export config');
      }
    },
  });
}
```

**文件**: `extensions/commands/import.ts` - 同样添加 try-catch

---

## 阶段三：工程化治理与测试健全

### 9. 添加 TypeScript 配置 (BUG-09)

**新建文件**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./extensions"
  },
  "include": ["extensions/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

**修改文件**: `package.json`

```json
{
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  }
}
```

---

### 10. 消除测试中的 any 滥用 (BUG-09)

**文件**: `extensions/__tests__/*.test.ts`

**修改内容**: 使用 `vi.mocked()` 替代 `as any`

```typescript
// 修改前
(readJson as any).mockResolvedValue(mockData);

// 修改后
vi.mocked(readJson).mockResolvedValue(mockData);

// 或者使用类型断言
(readJson as Mock).mockResolvedValue(mockData);
```

---

### 11. 补全跳过的测试用例 (BUG-10)

**文件**: `extensions/__tests__/cloud/webdav.test.ts`

**修改内容**: 移除 skip 注释，补充测试

```typescript
describe('webdavUpload', () => {
  // ... 已有测试 ...
  
  it('should retry on 503 error', async () => {
    // Mock MKCOL
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Mock PUT 返回 503
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
    // Mock 重试后成功
    mockFetch.mockResolvedValueOnce({ ok: true, statusText: 'OK' });

    await expect(webdavUpload(config, 'test data')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3); // MKCOL + 2x PUT
  });

  it('should throw WebDAVError on auth failure without retry', async () => {
    // Mock MKCOL
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Mock PUT 返回 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(webdavUpload(config, 'test data')).rejects.toThrow(WebDAVError);
    expect(mockFetch).toHaveBeenCalledTimes(2); // MKCOL + 1x PUT (no retry)
  });
});
```

**文件**: `extensions/__tests__/cloud/gist.test.ts` - 同样补充测试

---

## 阶段四：死代码清理与工程优化

### 12. 清理死代码 (BUG-07)

**文件**: `extensions/commands/backup.ts`

**修改内容**:
- 移除第14行未使用的导入 `handleCommandError` 和 `getErrorSuggestion`
- 移除第66行重复的动态导入 `const { writeJson } = await import('../helpers');`

```typescript
// 修改前 (第14行)
import { handleCommandError, getErrorSuggestion } from '../error-handler';

// 修改后：删除这行

// 修改前 (第66行)
const { writeJson } = await import('../helpers');

// 修改后：删除这行，使用顶部已导入的 writeJson
```

**文件**: `extensions/commands/cloud-setup.ts`

**修改内容**:
- 移除第8行未使用的导入 `handleCommandError` 和 `getErrorSuggestion`

```typescript
// 修改前
import { handleCommandError, getErrorSuggestion } from '../error-handler';

// 修改后：删除这行
```

---

### 13. 补充缺失的错误处理

**文件**: `extensions/commands/export.ts`

**修改内容**: 添加 try-catch 包装

```typescript
handler: async (args, ctx) => {
  try {
    // ... 原有逻辑 ...
  } catch (err) {
    handleCommandError(ctx, err, 'export config');
  }
}
```

**文件**: `extensions/commands/import.ts` - 同样添加顶层 try-catch

---

## 阶段五（可选）：WebDAV 多级目录创建

### 12. 支持 WebDAV 多级目录 (BUG-11)

**文件**: `extensions/cloud/webdav.ts`

**修改内容**: 递归创建目录

```typescript
async function ensureWebDAVDirectory(
  config: WebDAVConfig,
  remoteDir: string
): Promise<void> {
  if (!remoteDir) return;
  
  const parts = remoteDir.split('/').filter(Boolean);
  const base = config.url.replace(/\/+$/, '');
  const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
  
  let currentPath = '';
  for (const part of parts) {
    currentPath += `/${part}`;
    const dirUrl = `${base}${currentPath}`;
    
    try {
      await fetch(dirUrl, {
        method: 'MKCOL',
        headers: { Authorization: authHeader },
      });
    } catch {
      // 目录可能已存在，忽略错误
    }
  }
}

export async function webdavUpload(
  config: WebDAVConfig,
  data: string
): Promise<void> {
  // 确保远程目录存在（递归创建）
  const remoteDir = (config.remotePath || '/pi-config-backup.json')
    .replace(/\/[^/]+$/, '')
    .replace(/^\/+/, '');
  
  await ensureWebDAVDirectory(config, remoteDir);
  
  // ... 后续上传逻辑 ...
}
```

---

## 实施顺序建议

1. **立即实施** (阶段一):
   - BUG-01 (路径穿越) - 安全漏洞，必须立即修复
   - BUG-02 (重试机制) - 核心功能缺陷
   - BUG-05 (定时器泄漏) - 与 BUG-02 一起修复

2. **本周内完成** (阶段一 + 部分阶段二):
   - BUG-03 (二进制文件)
   - BUG-04 (Checksum)
   - BUG-06 (错误捕获)
   - BUG-08 (设置还原顺序)

3. **下周完成** (阶段二 + 阶段三):
   - BUG-07 (error-handler 精简 + 死代码清理)
   - BUG-09 (TypeScript 配置)
   - BUG-10 (测试补全)

4. **后续优化** (阶段四):
   - BUG-11 (WebDAV 多级目录)

---

## 验证方法

每个修改完成后，运行以下命令验证：

```bash
# 类型检查
npm run typecheck

# 运行测试
npm test

# 生成覆盖率报告
npm run test:coverage
```

目标覆盖率提升至 85%+，核心模块（helpers.ts, file-collector.ts）达到 95%+。

---

## 注意事项

1. 修改前创建备份分支：`git checkout -b fix/2026-08-18_critical_bugs`
2. 每个修复单独提交，便于 Code Review
3. 修复后更新相关测试用例
4. 更新 README.md 中的已知问题说明
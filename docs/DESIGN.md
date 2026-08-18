# pi-config-sync 改进设计方案

## 项目概述

本文档详细描述了 pi-config-sync 项目的改进设计方案，包括模块化拆分、测试策略、错误处理、备份历史功能等。

## 设计目标

1. **模块化**：将单文件拆分为职责单一的模块
2. **可测试性**：建立完善的测试体系，达到高覆盖率
3. **健壮性**：增强错误处理、输入验证和重试机制
4. **可维护性**：清晰的代码结构和依赖管理

## 模块化拆分设计

### 目录结构

```
extensions/
├── config-migration.ts          # 主入口，注册命令
├── types.ts                     # 类型定义、常量
├── helpers.ts                   # 通用辅助函数
├── file-collector.ts            # 文件收集与恢复
├── history.ts                   # 备份历史管理
├── cloud/
│   ├── webdav.ts               # WebDAV 适配器
│   └── gist.ts                 # GitHub Gist 适配器
├── commands/
│   ├── export.ts               # /export-config
│   ├── import.ts               # /import-config
│   ├── backup.ts               # /config-backup
│   └── cloud-setup.ts          # /config-cloud-setup + /config-cloud-status
├── __tests__/
│   ├── types.test.ts
│   ├── helpers.test.ts
│   ├── file-collector.test.ts
│   ├── history.test.ts
│   ├── cloud/
│   │   ├── webdav.test.ts
│   │   └── gist.test.ts
│   └── commands/
│       ├── export.test.ts
│       ├── import.test.ts
│       ├── backup.test.ts
│       └── cloud-setup.test.ts
```

### 模块职责

| 模块 | 职责 | 行数估算 |
|------|------|----------|
| `types.ts` | 类型定义、常量、错误类 | ~80 |
| `helpers.ts` | 通用辅助函数（readJson, writeJson等） | ~60 |
| `file-collector.ts` | 文件收集与恢复 | ~80 |
| `history.ts` | 备份历史管理 | ~60 |
| `cloud/webdav.ts` | WebDAV 操作 | ~80 |
| `cloud/gist.ts` | GitHub Gist 操作 | ~80 |
| `commands/*.ts` | 命令处理器 | ~40-130 |
| `config-migration.ts` | 主入口，注册命令 | ~30 |

### 依赖管理

**架构约束**：确保单向依赖，避免循环依赖

```
types.ts（无依赖）
    ↓
helpers.ts（依赖 types）
    ↓
file-collector.ts（依赖 helpers）
history.ts（依赖 helpers）
    ↓
cloud/*.ts（依赖 helpers）
    ↓
commands/*.ts（依赖所有）
    ↓
config-migration.ts（依赖 commands）
```

**依赖检查**：使用 `madge` 工具检测循环依赖

## 测试策略设计

### 测试配置

| 配置项 | 选择 |
|--------|------|
| 测试框架 | Vitest |
| 测试类型 | 单元测试优先 |
| 覆盖率目标 | 80%+ 行覆盖率，100% 分支覆盖率 |
| 测试文件位置 | `__tests__/` 目录 |
| 测试数据 | 工厂函数 |
| Mock 策略 | Mock 外部依赖（fetch/网络） |

### 覆盖率优先级

1. **核心模块**（helpers.ts）：100% 分支 + 90%+ 行
2. **网络交互模块**（cloud/*.ts）：100% 分支 + 80%+ 行
3. **命令处理器**（commands/*.ts）：100% 分支 + 70%+ 行

### Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['extensions/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['extensions/**/*.ts'],
      exclude: ['extensions/__tests__/**', 'extensions/**/*.test.ts'],
    },
  },
});
```

### 工厂函数

```typescript
// __tests__/factories.ts
import type { BackupData, CloudConfig } from '../types';

export function createTestBackupData(
  overrides?: Partial<BackupData>
): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { theme: 'dark' },
    packages: ['test-package'],
    files: {},
    ...overrides,
  };
}

export function createTestCloudConfig(
  overrides?: Partial<CloudConfig>
): CloudConfig {
  return {
    provider: 'webdav',
    webdav: {
      url: 'https://dav.example.com/dav/',
      username: 'testuser',
      password: 'testpass',
      remotePath: '/pi-config-backup.json',
    },
    ...overrides,
  };
}

export function createTestSettings(
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  return {
    theme: 'dark',
    packages: ['package1', 'package2'],
    ...overrides,
  };
}
```

## 错误处理设计

### 分层策略

```
底层函数（helpers/cloud）
    ↓ throw 具体错误
顶层 handler（commands）
    ↓ catch 并格式化
用户友好消息
```

### 错误层次结构

```typescript
// types.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class FileError extends AppError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'FileError';
  }
}

export class CloudError extends AppError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'CloudError';
  }
}

export class WebDAVError extends CloudError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'WebDAVError';
  }
}

export class GistError extends CloudError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'GistError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'ValidationError';
  }
}
```

### 错误代码定义

```typescript
// types.ts
export const ErrorCodes = {
  // File errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_PERMISSION_ERROR: 'FILE_PERMISSION_ERROR',
  
  // Cloud errors
  CLOUD_AUTH_FAILED: 'CLOUD_AUTH_FAILED',
  CLOUD_NOT_FOUND: 'CLOUD_NOT_FOUND',
  CLOUD_NETWORK_ERROR: 'CLOUD_NETWORK_ERROR',
  CLOUD_RATE_LIMITED: 'CLOUD_RATE_LIMITED',
  
  // Validation errors
  VALIDATION_INVALID_URL: 'VALIDATION_INVALID_URL',
  VALIDATION_MISSING_CONFIG: 'VALIDATION_MISSING_CONFIG',
  VALIDATION_UNSUPPORTED_VERSION: 'VALIDATION_UNSUPPORTED_VERSION',
} as const;
```

### 错误处理示例

```typescript
// helpers.ts
export async function readJson<T>(path: string): Promise<T> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      if (err.code === 'ENOENT') {
        throw new FileError(
          `File not found: ${path}`,
          ErrorCodes.FILE_NOT_FOUND,
          err
        );
      }
    }
    throw new FileError(
      `Failed to read file: ${path}`,
      ErrorCodes.FILE_READ_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

// commands/import.ts
try {
  const data = await readJson<BackupData>(filePath);
  // ...
} catch (err) {
  if (err instanceof FileError) {
    ctx.ui.notify(`File error: ${err.message}`, 'error');
  } else if (err instanceof ValidationError) {
    ctx.ui.notify(`Validation error: ${err.message}`, 'error');
  } else {
    ctx.ui.notify(`Unexpected error: ${err instanceof Error ? err.message : err}`, 'error');
  }
}
```

## 备份历史功能设计

### 存储位置

```
~/.pi/agent/backup-history.json
```

### 记录格式

```typescript
interface BackupHistoryRecord {
  id: string;                    // 唯一标识
  timestamp: string;             // ISO 时间戳
  source: 'local' | 'webdav' | 'gist';
  status: 'success' | 'failed';
  fileCount: number;             // 文件数量
  packageCount: number;          // 包数量
  checksum?: string;             // 可选：数据校验和
  duration?: number;             // 可选：耗时（毫秒）
  error?: string;                // 可选：失败原因
}

interface BackupHistory {
  records: BackupHistoryRecord[];
  lastUpdated: string;
}
```

### 清理策略

- **保留数量**：最近 30 条记录
- **清理时机**：每次写入新记录时检查
- **清理方式**：删除最旧的记录

### 并发处理

使用原子写入防止并发冲突：

```typescript
export async function saveHistory(history: BackupHistory): Promise<void> {
  const historyPath = join(PI_AGENT, 'backup-history.json');
  const tempPath = `${historyPath}.tmp`;
  
  // 写入临时文件
  await writeJson(tempPath, history);
  
  // 原子重命名
  await rename(tempPath, historyPath);
}
```

### 历史管理接口

```typescript
export class BackupHistoryManager {
  private historyPath: string;
  
  constructor() {
    this.historyPath = join(PI_AGENT, 'backup-history.json');
  }
  
  async addRecord(record: Omit<BackupHistoryRecord, 'id'>): Promise<void> {
    const history = await this.load();
    const newRecord: BackupHistoryRecord = {
      ...record,
      id: this.generateId(),
    };
    history.records.unshift(newRecord);
    
    // 清理旧记录
    if (history.records.length > 30) {
      history.records = history.records.slice(0, 30);
    }
    
    history.lastUpdated = new Date().toISOString();
    await this.save(history);
  }
  
  async getRecords(limit?: number): Promise<BackupHistoryRecord[]> {
    const history = await this.load();
    return limit ? history.records.slice(0, limit) : history.records;
  }
  
  async clear(): Promise<void> {
    await this.save({ records: [], lastUpdated: new Date().toISOString() });
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
```

## 重试机制设计

### 配置参数

| 参数 | 值 |
|------|-----|
| 最大重试次数 | 3 |
| 超时时间 | 30s |
| 可重试错误 | 仅网络错误 |
| 退避策略 | 指数退避（1s, 2s, 4s） |

### 实现代码

```typescript
// helpers.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    timeout?: number;
    retryableErrors?: string[];
  } = {}
): Promise<T> {
  const { maxRetries = 3, timeout = 30000, retryableErrors = ['NETWORK_ERROR'] } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 添加超时控制
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        ),
      ]);
      return result;
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = err instanceof CloudError && 
        retryableErrors.includes(err.code);
      
      if (isLastAttempt || !isRetryable) {
        throw err;
      }
      
      // 指数退避
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// cloud/webdav.ts
export async function webdavUpload(
  config: NonNullable<CloudConfig['webdav']>,
  data: string
): Promise<void> {
  return withRetry(async () => {
    // WebDAV 上传逻辑
  }, {
    retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR],
  });
}
```

## 安全考虑

### 当前决策

- **明文凭据**：暂不处理，风险可接受
- **理由**：支持的 WebDAV + Gist + Local 都是基本用户信任的安全模型存储

### 未来考虑

如需增强安全性，可考虑：
1. 使用系统钥匙串存储凭据
2. 实现 AES 加密存储
3. 支持环境变量配置凭据

## 开发顺序

### 阶段 1：基础模块（1-2天）

1. **types.ts** + 测试
   - 类型定义
   - 错误类
   - 常量

2. **helpers.ts** + 测试
   - readJson, writeJson
   - readSettings
   - filterSettings, extractPackages
   - toBase64, fromBase64

### 阶段 2：文件操作（1天）

3. **file-collector.ts** + 测试
   - collectFiles, collectDir
   - restoreFiles

### 阶段 3：云适配器（2-3天）

4. **cloud/webdav.ts** + 测试
   - webdavRequest
   - webdavUpload
   - webdavDownload

5. **cloud/gist.ts** + 测试
   - gistHeaders
   - gistUpload
   - gistDownload

### 阶段 4：命令处理器（2-3天）

6. **commands/export.ts** + 测试
7. **commands/import.ts** + 测试
8. **commands/backup.ts** + 测试
9. **commands/cloud-setup.ts** + 测试

### 阶段 5：历史功能（1天）

10. **history.ts** + 测试
    - BackupHistoryManager
    - 原子写入
    - 清理策略

### 阶段 6：集成测试（1-2天）

11. **config-migration.ts** 主入口重构
12. **全流程测试**
13. **覆盖率验证**

## 实施计划

### 总时间估算

- **模块化拆分**：3-4天
- **测试开发**：3-4天
- **错误处理**：1-2天
- **备份历史**：1天
- **集成测试**：1-2天
- **总计**：9-13天

### 里程碑

1. **M1**：基础模块完成 + 单元测试（Day 3）
2. **M2**：云适配器完成 + Mock 测试（Day 6）
3. **M3**：命令处理器完成 + 集成测试（Day 9）
4. **M4**：备份历史完成 + 覆盖率验证（Day 11）
5. **M5**：全流程测试 + 文档更新（Day 13）

### 验收标准

1. ✅ 模块化拆分完成，无循环依赖
2. ✅ 所有测试通过
3. ✅ 行覆盖率 ≥ 80%
4. ✅ 分支覆盖率 = 100%
5. ✅ 错误处理完善，用户友好
6. ✅ 备份历史功能正常
7. ✅ 重试机制工作正常
8. ✅ 文档更新完成

## 风险与缓解

### 风险 1：循环依赖

- **影响**：模块无法正常加载
- **缓解**：使用 madge 工具检测，确保单向依赖

### 风险 2：测试覆盖率不足

- **影响**：代码质量无法保证
- **缓解**：分阶段验证，优先覆盖核心模块

### 风险 3：云服务 API 变更

- **影响**：适配器功能失效
- **缓解**：使用 Mock 测试，隔离外部依赖

### 风险 4：并发写入冲突

- **影响**：备份历史数据损坏
- **缓解**：使用原子写入，单设备优先

## 附录

### 参考资料

1. [Vitest 官方文档](https://vitest.dev/)
2. [TypeScript 最佳实践](https://www.typescriptlang.org/docs/handbook/)
3. [Node.js 错误处理](https://nodejs.org/api/errors.html)

### 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-08-18 | 初始设计方案 |
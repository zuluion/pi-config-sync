# AGENTS.md — pi-config-sync 项目规范

## 语言与沟通
- 对话使用**中文**，专业术语（函数名、API、设计模式、CLI 命令等）保留英文
- 代码中的标识符、注释一律使用英文

## 编码风格
- 简洁优先：不过度抽象，不写无意义的注释（代码自解释）
- 不在不需要时主动加错误处理、fallback 或验证逻辑——只在系统边界处加
- 不设计未来才需要的功能，不提前重构
- TypeScript 严格模式，类型不使用 `any`

## 协作方式
- 做任何破坏性操作（删除文件、force push、清数据库等）前必须先确认
- 不主动 commit，等用户明确提出再提交
- 修改范围超出当前任务前，先出方案征求同意

## Git 规范

### Commit Message
格式遵循 Conventional Commits：
```
type(scope): 简短描述

修改文件：
├── path/to/file1.md    — 变更说明
├── path/to/file2.md    — 变更说明
└── path/to/
    ├── file3.md        — 变更说明
    └── file4.md        — 变更说明
```
- type: feat / fix / refactor / chore / docs / test / style / perf
- scope 可选，描述用英文，祈使句，首字母小写，结尾不加句号
- 文件树列出所有变更文件，每个文件附简要变更说明

### 分支命名
```
type/YYYY-MM-DD_业务描述
```
- type: feature / fix / hotfix / refactor / chore
- 日期格式 YYYY-MM-DD，下划线连接业务描述（英文，小写，单词间用下划线）
- 示例: `feature/2026-08-17_add_cloud_backup`

## 项目结构
```
pi-config-sync/
├── extensions/              # Pi 扩展
│   └── config-migration.ts  # 主扩展（导出/导入/云备份）
├── package.json             # Pi 包清单
├── README.md
├── LICENSE
└── AGENTS.md
```

## 开发指南
- 扩展文件放置在 `extensions/` 目录下
- 扩展通过 `pi.registerCommand()` 注册命令
- 云备份凭据存储在 `~/.pi/agent/config-backup.json`
- 导出的备份格式版本号目前为 `1`

## 环境
- OS: Windows 11，shell 使用 bash（Unix 语法，路径用正斜杠）
- 测试时使用 `pi -e <extension>` 或 `/reload`

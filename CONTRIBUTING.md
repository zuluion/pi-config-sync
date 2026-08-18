# Contributing to pi-config-sync

感谢你对 pi-config-sync 的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 报告 Bug

1. 在 [Issues](https://github.com/zuluion/pi-config-sync/issues) 中搜索是否已有相同问题
2. 如果没有，请创建新的 Issue，包含：
   - 问题描述
   - 复现步骤
   - 期望行为 vs 实际行为
   - 环境信息（Node.js 版本、操作系统等）

### 提交 Pull Request

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 修改代码并添加测试
4. 确保所有检查通过：
   ```bash
   npm run typecheck
   npm test
   ```
5. 提交 PR 并填写清晰的描述

### 代码规范

- 使用 TypeScript 严格模式
- 遵循现有的代码风格
- 为新功能添加测试
- 保持测试覆盖率不低于 80%

## 开发环境

```bash
# 克隆仓库
git clone https://github.com/zuluion/pi-config-sync.git
cd pi-config-sync

# 安装依赖
npm install

# 运行测试
npm test

# 类型检查
npm run typecheck

# 本地开发测试
pi -e ./extensions/config-migration.ts
```

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
type(scope): description

# 示例
feat(backup): add progress indicator
fix(webdav): handle network timeout
docs(readme): update installation guide
```

## 问题反馈

如有任何问题，欢迎通过 Issue 或 Discussion 联系我们。

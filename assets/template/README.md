# devflow-template

Codex 开发编排工具脚手架，通过一个 CLI 命令即可把 DevFlow 七步流程接入任意仓库。

## 使用 CLI 生成脚手架
```bash
# 等价命令：pnpm dlx @lbtlm/devflow-template my-project
pnpm dlx @lbtlm/devflow-template init my-project
cd my-project
```

CLI 默认在当前目录生成以下内容，如遇冲突文件会被跳过，可追加 `--force` 强制覆盖：
- `.devflow/`：流程配置、状态管理、构建脚本与 Codex 启动提示
- `.devflow/steps/`：各阶段 JSON 产物占位
- `.github/workflows/devflow-build-check.yml`：CI 自动构建检查
- `README.md`、`DevFlow_Summary.md`：初始说明文档

CLI 支持：
- `--dry-run`：仅预览将要写入的文件
- `--list`：列出模板包含的全部文件
- `--force`：覆盖已存在文件

## 在生成的项目中开始 DevFlow
1. `corepack enable pnpm`
2. （若存在 `package.json`）执行 `pnpm install`
3. 在 Codex 会话的第一条消息粘贴 `.devflow/bootstrap/codex-start.md`
4. 提供业务需求，Codex 会依序生成 `.devflow/steps/step-0N.<type>.json` 并更新 `.devflow/state.json`
5. 进入 step-05.impl 时，要求 Codex 按 Todos 修改代码、运行必要的构建/测试并记录产出

## 构建校验自动化
当流程进入第六步 `build-check` 时，Codex 会创建 `.devflow/queue/build-check.json` 以触发 CI；GitHub Actions 将运行 `.devflow/tools/build-check.mjs`，根据仓库特征执行：
- Node：`pnpm typecheck` → `pnpm build` → `pnpm lint`
- Go：`go mod tidy` → `go build ./...` → `golangci-lint run`
- Rust：`cargo check` → `cargo clippy --all-targets`
- Python：`pip check` → `flake8 .`

CI 会将结果写入 `.devflow/steps/step-06.build-check.json` 并清理队列文件，实现整套自动化构建校验。

## 本仓库开发脚本
- `pnpm run dev`：查看 CLI 帮助信息
- `pnpm run build`：编译 TypeScript，输出到 `dist/`
- `pnpm run test`：使用 Vitest 运行测试
- `pnpm run lint`：执行 TypeScript 类型检查

更多背景与细节参见 `DevFlow_Summary.md`。

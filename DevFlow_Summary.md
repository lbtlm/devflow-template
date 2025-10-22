# DevFlow-Template 总结文档  
（版本：2025-10-22）

## 一、项目目标  
让 Codex 能在任意仓库中自动执行从「需求 → 计划 → 任务 → 实现 → 构建检查 → 总结」的开发编排流程，并保持状态与产物在仓库内持久化。

---

## 二、项目结构
```
.devflow/
  ├── devflow.config.yaml      # 全局配置与默认流程
  ├── state.json               # 当前会话状态（丰富状态）
  ├── schema/
  │   └── step.schema.json     # .devflow/steps/*.json 结构定义
  ├── tools/
  │   ├── build-check.mjs      # 多语言构建检测脚本
  ├── bootstrap/
  │   └── codex-start.md       # 启动提示（供 Codex 会话使用）
  ├── queue/                   # 用于触发 CI 构建检查的请求文件
.devflow/steps/
  └── .keep                    # 存放各阶段 JSON 产物
.github/
  └── workflows/
      └── devflow-build-check.yml  # 云端构建检查 CI
```

---

## 三、默认流程（7 步）
1. **requirements** 需求澄清与验收标准  
2. **api-contract** 接口定义与 DTO 设计  
3. **plan** 开发计划与拆解  
4. **todos** 任务清单与依赖关系  
5. **impl** 功能实现（可多轮）  
6. **build-check** 仅进行类型与构建校验（多语言支持）  
7. **summary** 收尾总结与经验沉淀  

---

## 四、文件约定

### 1. .devflow/steps/ 文件
- 命名：`step-01.requirements.json`、`step-02.plan.json` …  
- 格式：纯 JSON（机器可读，不生成 md）。  
- 字段示例：
```json
{
  "id": "step-02",
  "type": "plan",
  "createdAt": "2025-10-22T10:40:00Z",
  "status": "approved",
  "goal": "...",
  "summary": "...",
  "decisions": [],
  "todos": [],
  "embedding": "本阶段摘要",
  "metrics": { "confidence": 0.93 }
}
```

### 2. `.devflow/state.json`
记录当前活跃 session、当前步骤、完成情况、建议下一步、构建状态与指标：
```json
{
  "activeSession": "2025-10-22T1145Z-demo",
  "currentStep": "step-05.impl",
  "completed": ["step-01.requirements","step-02.api-contract"],
  "suggestedNext": "step-06.build-check",
  "lastBuildStatus": "ok",
  "metrics": {"totalSteps":7,"passed":5,"failed":0,"warnings":2},
  "updatedAt": "2025-10-22T11:58:00Z"
}
```

---

## 五、Codex 内嵌驱动机制
- Codex 直接读取 `.devflow/state.json` 与最近的 `.devflow/steps/step-XX.*.json`。  
- 在阶段切换时自动提示：「是否生成 step-0N.<type>.json？」（混合模式）。  
- 用户确认后，Codex 生成 JSON 文件并更新 `state.json`。  
- 到第六步时：Codex 创建 `.devflow/queue/build-check.json` 触发 CI；  
  GitHub Actions 执行完后写回 `.devflow/steps/step-06.build-check.json`；  
  Codex 读取结果后继续到 `summary`。

---

## 六、构建检查（多语言固定规则）
| 技术栈 | 默认命令 |
|---------|-----------|
| Node/Vue/React | `pnpm typecheck` → `pnpm build` → `pnpm lint` |
| Golang | `go mod tidy` → `go build ./...` → `golangci-lint run` |
| Rust | `cargo check` → `cargo clippy` |
| Python | `pip check` → `flake8 .` |

CI 会自动识别根目录文件（`package.json`、`go.mod` 等）来确定检测栈。

---

## 七、GitHub Actions 工作流
`.github/workflows/devflow-build-check.yml`  
- 触发条件：推送 `.devflow/queue/build-check.json`  
- 自动运行多语言检查脚本  
- 将结果回写到 `.devflow/steps/step-06.build-check.json`  
- 自动提交 commit 信息：`ci(devflow): update step-06.build-check.json [skip ci]`

---

## 八、模板与初始化
- 模板仓库名：`lbtlm/devflow-template`  
- NPM 包名：`@lbtlm/devflow-template`  
- 新项目可通过：
  ```bash
  pnpm dlx @lbtlm/devflow-template init
  ```
  将 `.devflow/` 与 `.github/workflows/` 初始化到本地仓库。

---

## 九、使用方法（手动交由 Codex 执行）
1. 在 Codex 新对话中连接到项目仓库。  
2. 将 `.devflow/bootstrap/codex-start.md` 的全部内容粘贴为第一条消息。  
3. 紧接着输入需求说明（自然语言即可）。  
4. Codex 将自动创建 `.devflow/steps/step-01.requirements.json` 并提示下一步。  
5. 确认后逐步推进直至 `summary` 完成。  

---

## 十、后续扩展方向
- 增加「文档生成」「测试覆盖率统计」等 Agent。  
- 接入跨仓库记忆（读取其他项目的 `state.json`）。  
- 提供图形化可视化界面（DevFlow Dashboard）。

# M-2 工作空间加载并发防护 — TDD 证据报告

## 任务来源
工单 M-2:工作空间加载并发防护
涉及文件:`src/state/workspaceContextStore.ts:43-77` + `src/components/business/ClubSwitcher.vue:47-56`

## 根因
`loadWorkspace` 没有在飞请求追踪,跨社团快速连点时,后发请求的 HTTP 响应若早于先发请求返回,先发请求晚到的旧数据会覆盖新数据,导致 store 状态与 UI 导航不一致。同 clubId 并发点击也会重复发请求。

## 用户旅程
**作为** 多社团用户
**我希望** 在下拉菜单中快速切换 A→B(或 B→A→B)时,工作空间上下文与导航落点严格匹配我最后一次点击的社团
**以便** store / session / 路由三者保持一致,避免"点 A 跳到 B"或"点 B 跳回 A"的竞态 bug

## 修复策略
沿用仓库内已成熟的 **P2-16 代次计数模式**(`useMyClubs.ts` / `BatchOperationPage.vue` / `useDebouncedSearch.ts`):
- `loadGeneration` 计数器 → 并发 loadWorkspace 时仅最新一次可写回 store
- `inFlightByClub` 同 clubId 在飞去重 → 避免重复请求
- 捕获 `inFlightUserId` → 规避 Vue `watch` 异步触发的时序问题(直接比对 userId,更可靠)

## 测试 → 实现 → 验证

| # | 保证的行为 | 测试位置 | 类型 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 后发请求先返回时,旧请求结果不得覆盖新请求上下文 | `workspaceContextStore.test.ts:214` | unit | PASS | RED→GREEN 阶段已验证 |
| 2 | 同 clubId 并发请求仅触发一次 API 调用 | `workspaceContextStore.test.ts:251` | unit | PASS | RED→GREEN 阶段已验证 |
| 3 | 旧请求失败时不得清空新请求已成功写入的上下文 | `workspaceContextStore.test.ts:283` | unit | PASS | RED→GREEN 阶段已验证 |
| 4 | 换账号时在途旧请求结果不得写回 | `workspaceContextStore.test.ts:319` | unit | PASS | RED→GREEN 阶段已验证 |
| 5 | 旧请求的 finally 不得错误复位新请求的 loading | `workspaceContextStore.test.ts:343` | unit | PASS | RED→GREEN 阶段已验证 |
| 6 | 快速切换 B→C,旧请求晚到不污染 store / session / 导航 | `ClubSwitcher.test.ts:377` | integration | PASS | RED→GREEN 阶段已验证 |
| 7 | 旧请求失败时不得清空 C 上下文(端到端) | `ClubSwitcher.test.ts:452` | integration | PASS | RED→GREEN 阶段已验证 |
| 8 | 同 clubId 连续点击多次仅触发一次 getContext | `ClubSwitcher.test.ts:498` | integration | PASS | RED→GREEN 阶段已验证 |

## 已知改进(非阻塞)
- 组件层 `switchClub` 未加 `if (switching.value) return` 守卫,store 层代次检查已能保证正确性,
  守卫属 UX 优化(避免重复 HTTP 请求),可放入后续 P3 优化。

## 合并证据
- 分支:`fix/M-2-workspace-concurrency`
- 提交:`97a614c fix(M-2): 工作空间加载并发防护`
- 修改:3 文件,+388/-20
- 全量测试:1517/1517 PASS
- 覆盖率:workspaceContextStore.ts 100% / 100% / 100% / 100%(Stmts/Branch/Funcs/Lines)
- 覆盖率:ClubSwitcher.vue 97.56% / 97.05% / 100% / 97.29%
- Lint:clean
- Typecheck:clean

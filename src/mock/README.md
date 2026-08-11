# 平台支撑模块 · Mock 数据层（模拟后端）

> 更新日期：2026-08-08

## 核心职责

浏览器/Vite 开发期的模拟后端：有状态内存库、29 个状态机转换表、HTTP 端点路由与中间件（鉴权、作用域、错误、multipart 解析）。页面刷新即重置。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `state-machines/transitions.ts` | 状态机表 | 29 个状态机的**精确转换表（306 条规则）**，`StatesOf<M>` 类型词表唯一数据源（MRM-014） |
| `state-machines/index.ts` | 状态机元数据 | `STATE_MACHINE_METAS`、`isValidState/isValidTransition/assertTransition`、规则统计 |
| `index.ts` | 端点聚合 | 9 组 handler（identity/public/organization/notification/personal/member/platform/list/file），`mergePathParams` + `withStatus` |
| `auth.ts` | 用户种子 | 多角色 Mock 用户（admin/leader/hr/deptleader/interviewer/member/applicant/incomplete/unverified/disabled） |
| `db.ts` / `db-members.ts` / `db-organization.ts` / `db-recruitment.ts` / `db-forms.ts` / `db-corrections.ts` / `db-audit.ts` | 内存库 | 各领域有状态数据源 |
| `recruitment-api.ts` | 招新端点 | 普通/联合招新全部 HTTP 端点（约 100 个） |
| `notifications.ts` | 通知库 | 通知事实、模板、偏好、邮件发件箱、kill-switch、去重 |
| `governance.ts` | 治理库 | 重认证 proof、13 类高风险命令、真实数据开关、OIDC 配置、异常访问 |
| `reset.ts` | 测试重置 | 跨用例状态归位 |
| `errors.ts` | 错误库 | `resolveMockError` / `mockErrorBody` / `MOCK_ERROR_HTTP` |
| `mock-plugin.ts`（根目录） | Vite 插件 | `localMockPlugin` 拦截 `/api/*`，路由匹配 + multipart 解析 |

## 对外接口

- 全部端点挂 `/api/*`；开发期由 `mock-plugin.ts` 在 Vite 中间件层拦截，生产由真实后端替换。
- `MockMethod = { url, method, response }`；支持 `rawResponse` 透传（如文件下载）。

## 核心逻辑摘要

- **状态机单源**：`transitions.ts` 是状态词表唯一来源；db 层类型经 `StatesOf<M>` 派生，禁止手工再写字面量联合，避免双轨漂移。
- 写操作必须先 `assertTransition` 校验状态转换合法性，再执行业务前置条件与副作用（通知/审计/历史同事务）。
- Mock 层模拟真实后端的幂等、版本冲突（409）、业务拒绝（422）、外部不确定（202/IFC-ERR-013/014）语义。
- 高风险命令经 `assertHighRisk` 重认证拦截；`mock/degraded` 端点模拟 Casdoor 降级窗口。
- `resetSharedState` / `resetIdentityMockState` / `resetOrgDb` / `resetForms` 等供测试归位。

## 典型调用链

`Vite 请求 /api/org/:clubId/recruitment/:activityId/publish` → `mock-plugin.matchRoute` → handler → db 层 `assertTransition('SM-REC-001', ...)` → 业务副作用 → `withStatus` 返回 `{ code, data }`。

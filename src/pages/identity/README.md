# 领域模块 · 身份与资料

> 更新日期：2026-08-08
> 状态机：`SM-IDN-001`（账号访问）、`SM-IDN-002`（资料写入门）、`SM-IDN-003`（资料同步）

## 核心职责

承载用户登录会话、个人资料、邮箱验证、资料同步冲突处理以及账号禁用/删除/降级等身份域能力。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `LoginPage.vue` | 页面 | 登录入口，支持 Mock / OIDC 两种认证模式 |
| `AuthCallbackPage.vue` | 页面 | OIDC 授权回调落点 |
| `PersonalCenterPage.vue` | 页面 | 个人中心（待办 / 进行中 / 历史 / 日程四个 Tab） |
| `ProfilePage.vue` | 页面 | 个人资料查看 / 编辑 / 同步冲突处理（`mode` 区分） |
| `ProfileGatePage.vue` | 页面 | 资料门（未完成必填或邮箱未验证时的拦截页） |
| `loginTarget.ts` | 逻辑 | 根路径登录落点解析（`ADMIN_HOME_PATH` / `PROFILE_GATE_PATH` / 社团工作空间） |
| `LoginPage.test.ts` 等 | 测试 | 页面行为与登录目标解析单测 |

## 对外接口

- 路由：`/login`、`/auth/callback`、`/me`、`/me/profile*`、`/me/profile/required`
- 依赖服务：`@/services/modules` 的 `identityApi`（session/logout/profile/sync-conflict/reauth/clubs）、`@/services/auth`

## 核心逻辑摘要

- 会话经 `useSessionViewStore` 缓存；`loadSession` 失败时清空旧会话并记录失败原因。
- 资料门由 `profileGate.complete && emailVerified` 派生；未通过时路由守卫跳转 `P-GEN-04`。
- 降级窗口：`DEGRADED_WINDOW_MS = 15 分钟`（SRS-FAIL-001），`degradedWindowExpired` 强制跳 `P-GEN-03`。
- 账号禁用（`disabled`）在 Mock 层表现为会话端点返回 403，登录被拒绝。
- 资料同步冲突（`SM-IDN-003` conflict_pending）由 `ProfilePage` 的 sync-conflict 模式承载。

## 典型调用链

`登录页 startLogin` → `/api/auth/session`（`identityApi.getSession`）→ `sessionViewStore.loadSession` → 路由守卫按资料门/权限解析落点 → 进入个人中心或工作空间。

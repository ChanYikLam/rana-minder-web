# 页面模块 · 通用页与认证页

> 更新日期：2026-08-08

## 核心职责

认证页承载登录/回调节点；通用页承载错误、无权限、资料门、服务不可用与 404 等跨域边界页面。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `LoginPage.vue` | 页面 | 登录（Mock 角色选择 / OIDC 重定向 / disabled） |
| `AuthCallbackPage.vue` | 页面 | OIDC 回调 |
| `loginTarget.ts` | 逻辑 | 根路径/登录后落点解析 |
| `ForbiddenPage.vue` | 页面 | 403（`P-GEN-02`） |
| `NotFoundPage.vue` | 页面 | 404（`P-GEN-00` / `P-GEN-01`） |
| `ProfileGatePage.vue` | 页面 | 资料门（`P-GEN-04`） |
| `ServiceUnavailablePage.vue` | 页面 | 503 / 降级窗口过期（`P-GEN-03`） |

## 对外接口

- 路由：`/login`、`/auth/callback`、`/service-unavailable`、`/forbidden`（经 `P-GEN-02`）、`/me/profile/required`（`P-GEN-04`）、`/` 与通配回退（`P-GEN-00/01`）

## 核心逻辑摘要

- `P-GEN-02`（Forbidden）由路由守卫在 admin 权限不足或工作空间加载失败时重定向。
- `P-GEN-03`（ServiceUnavailable）在 Casdoor 降级窗口过期时强制跳转。
- `P-GEN-04`（ProfileGate）在会话未过资料门时拦截除资料编辑外的所有受保护路由。
- `loginTarget.ts` 集中解析根路径落点：平台管理首页 / 资料门 / 社团工作空间 / 个人中心。

## 典型调用链

`访问 /` → 守卫解析登录态 → `resolveLoginTarget` 决定落点；未登录 → `/login`（携带 redirect）；资料未完善 → `P-GEN-04`。

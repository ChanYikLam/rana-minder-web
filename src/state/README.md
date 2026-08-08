# 平台支撑模块 · 全局状态（Pinia Stores）

> 更新日期：2026-08-08

## 核心职责

会话视图、工作空间上下文、操作状态与通知视图的全局响应式状态管理。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `sessionViewStore.ts` | Pinia store | 会话用户、资料门、降级窗口、权限集、工作空间信息；`loadSession` / `clearSession` / `logout` / 降级时钟 |
| `workspaceContextStore.ts` | Pinia store | 当前社团上下文（clubId/clubName/role/permissions/memberId），按「用户 × 社团」缓存，`loadWorkspace` / `clearWorkspace` / `syncWithSession` |
| `operationStatusStore.ts` | Pinia store | 操作中/最近结果跟踪（幂等键 → pending） |
| `notificationViewStore.ts` | Pinia store | 未读数与通知列表缓存 |
| `index.ts` | 聚合导出 | 四个 store 统一出口 |

## 对外接口

- `useSessionViewStore`：`isAuthenticated`、`needsProfileGate`、`inDegradedWindow`、`degradedWindowExpired`、`hasPermission`、`loadSession`、`logout`
- `useWorkspaceContextStore`：`hasWorkspace`、`currentClubId`、`currentRole`、`hasPermission`、`setWorkspace`、`loadWorkspace`、`syncWithSession`
- `useOperationStatusStore`：`startOperation` / `finishOperation` / `isOperationPending`
- `useNotificationViewStore`：`loadUnreadCount` / `loadNotifications` / `markRead` / `markAllRead`

## 核心逻辑摘要

- **身份隔离**：工作空间缓存绑定 `currentUserId`，身份变化强制清空/重拉，杜绝跨身份串权限。
- **降级窗口**：`DEGRADED_WINDOW_MS = 15 分钟`，窗口内允许最小白名单；过期由路由侧跳 `P-GEN-03`。
- **权限合并**：`mergeClubPermissions` 切社团时仅覆盖 `club:*` 域，保留 `platform:*` 全局权限。
- 状态层仅承载视图/会话，不成为业务或权限权威（派生读模型可重建）。

## 典型调用链

`路由守卫 runNavigationGuard` → `useSessionViewStore` 判定登录/资料门 → `useWorkspaceContextStore.loadWorkspace(clubId)` 拉取社团上下文 → 侧边栏按 `hasPermission` 过滤导航。

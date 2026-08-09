# 平台支撑模块 · 布局与导航

> 更新日期：2026-08-08

## 核心职责

三套布局（Auth / Public / Default）与侧边栏、顶栏、面包屑等导航骨架，按权限动态渲染社团与平台导航分组。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `AuthLayout.vue` | 布局 | 登录/回调页布局 |
| `PublicLayout.vue` | 布局 | 公开目录/详情页布局 |
| `DefaultLayout.vue` | 布局 | 登录后主布局（工作空间 + 平台导航、顶栏、用户菜单） |
| `components/WorkspaceNav.vue` | 组件 | 工作空间导航容器 |
| `components/TopNav.vue` | 组件 | 顶栏（搜索、通知徽标、用户菜单、主题） |
| `components/Breadcrumb.vue` | 组件 | 面包屑 |
| `components/sideNav.ts` | 逻辑 | `buildClubGroups`（社团导航，按权限过滤）+ `ADMIN_NAV`（平台导航） |
| `components/ClubIndicator.vue` / `ContentContainer.vue` | 组件 | 社团指示与内容容器 |

## 对外接口

- 路由 `meta.layout` 选择布局：`auth` / `public` / `default`。
- `buildClubGroups(clubId, canAccess)` 返回权限过滤后的 L3 导航；`ADMIN_NAV` 供平台管理员。

## 核心逻辑摘要

- 导航按权限动态渲染（`permission` 单权限或 `permissionAny` 任一命中）。
- 社团无任何可用管理功能时不展示工作空间入口（`canAccessWorkspace`）。
- 用户菜单：平台管理员入口固定跳 `/admin/clubs` 且只校验 `platform:club:manage`；侧边栏「平台」分组按任一平台权限展示。
- 身份切换后工作空间上下文由 `workspaceContextStore` 重建，导航随之刷新。

## 典型调用链

`DefaultLayout` → `useWorkspaceContextStore` 取当前社团 → `buildClubGroups(clubId, canAccess)` 过滤 → 渲染侧边栏；平台权限命中 → 追加 `ADMIN_NAV`。

# 领域模块 · 组织与授权

> 更新日期：2026-08-08
> 状态机：`SM-ORG-001`（社团接入）、`SM-ORG-002`（Group 关系命令）、`SM-ORG-003`（预约管理命令）、`SM-ORG-004`（受控批量操作）

## 核心职责

社团接入向导、Group 稳定映射、职位模板、当前权限计算、社团停用/恢复/重绑、批量操作预览与执行。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `ClubManagePage.vue` | 页面 | 超级管理员社团接入/管理列表 |
| `ClubAccessWizardPage.vue` | 页面 | 社团接入向导（选 Group、负责人、部门/职位映射、导入成员、完成启用） |
| `BatchOperationPage.vue` | 页面 | 受控批量操作（成员/候选人/面试官三类目标） |
| `DashboardPage.vue` | 页面 | 社团工作空间看板（todos / recentActivities / permissions） |
| `sideNav.ts` | 逻辑 | 按权限过滤构建社团 L3 导航分组 |

## 对外接口

- 路由：`/admin/clubs`、`/admin/clubs/wizard`、`/org/:clubId/dashboard`、`/org/:clubId/batch`
- 服务：`organizationApi.getContext`、`getDashboard`；Mock 端点 `/api/admin/clubs*`（save-step/complete/import/suspend/recover/disconnect/repair/rebind/reaccess/reconcile）、`/api/org/:clubId/batch/*`

## 核心逻辑摘要

- `SM-ORG-001` 状态：`wizard_pending → enabled → suspended / sync_abnormal_ro → pending_rebind`；`db-organization.ts` 通过 `assertTransition(SM, club.status, to, event)` 校验每一步。
- 工作空间上下文由 `useWorkspaceContextStore` 维护，按「用户 × 社团」缓存，身份变化强制重拉（`loadWorkspace`）。
- 批量操作（`SM-ORG-004`）：`selecting → previewing → executing → completed / partially_failed`，仅失败项可重试。
- 预约管理命令（`SM-ORG-003`）：支持发起人失权暂停、前置条件失效暂停、重新确认、取消等恢复路径。

## 典型调用链

`ClubManagePage` → `/api/admin/clubs` → `db-organization.clubAccesses` → 向导 `completeWizard` 校验映射与负责人连续性 → `SM-ORG-001` 转 `enabled`。

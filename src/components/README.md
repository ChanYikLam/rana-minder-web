# 平台支撑模块 · UI 组件层

> 更新日期：2026-08-08

## 核心职责

可复用 UI 组件：业务组件（状态标签、权限守卫、面包屑等）、通用组件、展示组件、反馈组件、表单组件、操作组件与 shadcn-vue 基础组件。

## 关键组件

| 目录 | 典型组件 | 职责 |
|---|---|---|
| `components/business/` | `StateTag`、`PermissionGuard`、`DegradedBanner`、`Breadcrumbs`、`ClubSwitcher`、`RoleBadge` | 业务语义组件与状态词表映射（`stateLabels.ts`） |
| `components/common/` | `Button`、`Card`、`Input`、`DataTable`、`EmptyState`、`Pagination`、`PageStateBoundary`、`HighRiskConfirm`、`SyncIndicator` | 通用基础件 |
| `components/display/` | `ApplicantCard`、`FilterPanel`、`ScheduleView`、`StatChart`、`Timeline` | 展示类 |
| `components/feedback/` | `Banner`、`ErrorState`、`NotificationBadge`、`NotificationDetail`、`ProcessingTag` | 反馈类 |
| `components/form/` | `DynamicForm`、`AttachmentUpload`、`DateTimePicker`、`FieldPermission`、`NameSearch`、`ObjectPicker`、`PreferenceSorter` | 表单与动态渲染 |
| `components/operation/` | `BatchActionBar`、`ConfirmScope`、`DangerButton`、`ImpactPreview`、`PartialSuccess`、`WithdrawAction` | 操作类 |
| `components/ui/` | shadcn-vue 基础件（avatar/badge/button/dialog/table/tabs 等） | 设计系统基础 |

## 对外接口

- 各目录 `index.ts` 统一导出；`@/components` 别名引用。
- `StateTag` 使用 `stateLabels.ts` 的 `STATE_LABELS` 单映射，覆盖 SM-* 新词表与历史显示别名。

## 核心逻辑摘要

- `PermissionGuard` 按权限渲染/拦截；页面级权限仍在路由守卫统一判定，组件级仅作 UI 收敛。
- `PageStateBoundary` 承接 `PageState`（normal/loading/empty/error/forbidden）渲染。
- `HighRiskConfirm` + `ImpactPreview` 服务高风险命令二次确认与影响预览。
- `DynamicForm` 按表单版本渲染字段、权限与条件逻辑，配合 VeeValidate/Zod 校验（ADR-013 前端选型）。

## 典型调用链

`页面 → 业务组件（StateTag/PermissionGuard）→ 通用组件（DataTable/PageStateBoundary）→ ui 基础件`；状态文案统一经 `stateLabels.ts` 映射。

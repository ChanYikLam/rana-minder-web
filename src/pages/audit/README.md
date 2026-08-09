# 领域模块 · 纠错、审计与数据生命周期

> 更新日期：2026-08-08
> 状态机：`SM-AUD-001`（纠错）

## 核心职责

事实纠错（提交/批准/拒绝/撤回/执行）、不可变业务审计、数据保留策略与正式删除执行清单。不通过覆盖历史实现纠错或删除完成假象。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `CorrectionPage.vue` | 页面 | 纠错处置（社团 `view=manage` / 平台 `view=admin`） |
| `AuditLogPage.vue` | 页面 | 审计日志（社团 / 平台域） |
| `FormalDeletePage.vue` | 页面 | 正式删除（预览/执行/恢复门） |
| `RetentionPage.vue` | 页面 | 数据保留策略（发布/预览/执行） |
| `db-corrections.ts` | 数据层 | 纠错记录与审计轨迹 |
| `db-audit.ts` | 数据层 | 审计日志库（`writeAuditLog`） |
| `governance.ts` | 治理 | 重认证 proof、13 类高风险命令、真实数据开关、异常访问 |

## 对外接口

- 路由：`/org/:clubId/audit/*`、`/admin/audit/*`、`/admin/delete`、`/admin/retention`
- 服务/Mock：`/api/org/:clubId/audit/corrections*`、`/api/me/corrections*`、`/api/admin/audit/*`、`/api/admin/delete/*`、`/api/admin/retention/*`

## 核心逻辑摘要

- `SM-AUD-001`：`draft → submitted → approved / rejected / withdrawn`；submitted 超时转 overdue，overdue 仍可审批；approved 后 execute 完成纠错。
- 纠错不会复活普通编辑或改写不可变历史；`appendCorrectionAudit` / `writeCorrectionAuditLog` 保证审计闭环。
- 关键审计失败时业务不得成功；运行日志不得替代业务审计（AUD-003、GOV-006 至 009）。
- 正式删除：跨数据库/对象存储/缓存/索引/导出副本执行清单，部分失败不得宣称完成；删除重放用于灾难恢复。
- 保留策略发布/执行、正式删除执行、真实数据开关等属于高风险命令，需重认证 proof（`assertHighRisk`）。

## 典型调用链

`CorrectionPage 提交纠错` → `/api/org/:clubId/audit/corrections` → `SM-AUD-001 submitted` → 审批 approve → execute 写审计与更正；`FormalDeletePage` 先预览影响 → `assertHighRisk` 重认证 → 执行清单逐项删除并核验。

# 领域模块 · 统计与导出

> 更新日期：2026-08-08
> 状态机：`SM-EXP-001`（导出任务）

## 核心职责

权限内统计（社团/平台），异步导出任务生命周期管理、下载授权、失权/过期失效与产物删除。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `StatsPage.vue` | 页面 | 数据统计（社团 `/org/:clubId/stats`、平台 `/admin/stats`） |
| `ExportPage.vue` | 页面 | 导出任务（创建/列表/状态/下载） |
| `exportFormat.ts`（lib） | 逻辑 | 文件大小/时间格式化 |
| `db-recruitment.ts` / `demo-exp-stat-ops` 相关 | 数据层 | 统计投影与导出任务内存状态 |

## 对外接口

- 路由：`/org/:clubId/stats`、`/org/:clubId/exports`、`/admin/stats`、`/admin/exports`
- 服务/Mock：`/api/org/:clubId/stats`、`/api/org/:clubId/exports*`、`/api/admin/stats`、`/api/admin/exports*`（含 `:id/download`、`:id/status`）

## 核心逻辑摘要

- `SM-EXP-001`：`pending → generating → completed / failed / denied / expired / deleted`；completed 支持 download（失权则 denied）、expire、formal_delete_hit → deleted。
- 导出为提交后可恢复执行；下载是高风险命令（`export_download`），需重认证。
- 统计与导出不得授予访问或改变源业务事实；导出快照过期后禁止下载。
- 产物引用过期、范围收紧、失权、归档和删除必须使旧导出失效（事务边界 8）。

## 典型调用链

`ExportPage 创建导出` → `/api/org/:clubId/exports` → `SM-EXP-001 pending → generating` → 完成生成快照（completed）→ 用户下载（重认证）→ 过期/删除回收。

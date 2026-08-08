# 平台支撑模块 · 运维与可观测性

> 更新日期：2026-08-08
> 平台模块分类：运维与可观测性（ADR-011 内置最小观测边界）

## 核心职责

超级管理员内置只读状态页、脱敏运行日志、追踪关联、备份/恢复最近结果展示。不承担机器健康、完整指标平台或系统外运维告警。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `OpsStatusPage.vue` | 页面 | 运维状态页（应用版本、数据库连通、任务积压、Casdoor/邮件/文件/通知/备份最近结果） |
| `governance.ts`（trackAccessEvent/listAnomalyAlerts） | 治理 | 异常访问跟踪与告警聚合 |
| `mock/index.ts` platformHandlers | 服务 | `/api/admin/ops-status` 等端点 |

## 对外接口

- 路由：`/admin/ops-status`（`P-OPS-01`，权限 `platform:ops:view`）
- 服务/Mock：`GET /api/admin/ops-status`

## 核心逻辑摘要

- 内置观测不得成为业务或权限权威；状态过期显示未知。
- 运行日志默认保留 90 天（30 天在线 + 60 天压缩归档），网络/安全事件 ≥ 6 个月，业务审计独立长期保留（ADR-011）。
- 每次入口请求/后台任务/外部调用具有唯一追踪编号；业务幂等键与追踪编号不得混同。
- 异常访问（forbidden_attempt / rate_burst / cross_scope_attempt）经 `trackAccessEvent` 聚合为告警，可 acknowledge。
- 首版不提供外部监控消费的机器健康接口（PRD-OPT-055 收窄）。

## 典型调用链

`超级管理员访问 /admin/ops-status` → 路由守卫校验 `platform:ops:view` → `GET /api/admin/ops-status` → 内置只读状态摘要渲染。

# 领域模块 · 成员生命周期

> 更新日期：2026-08-08
> 状态机：`SM-MEM-001`（成员经历）、`SM-MEM-002`（部门/职位关系）、`SM-MEM-003`（部门关系申请）、`SM-MEM-004`（常规入社邀请）；联合/招新邀请共用 `SM-INV-001`

## 核心职责

成员经历、部门/职位关系、部门关系申请、常规入社邀请、任命/调岗/免职预约命令、任期、换届、退出与移除。当前关系以 Casdoor Group 回读为准，本地保存业务意图与不可变历史。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `MemberListPage.vue` | 页面 | 成员列表（管理 / 本人只读视图） |
| `MemberProfilePage.vue` | 页面 | 成员详情（经历、任职、数据异常块） |
| `DepartmentApplyPage.vue` | 页面 | 部门关系申请（提交/撤回/审批/执行） |
| `MembershipInvitePage.vue` | 页面 | 常规入社邀请管理 |
| `AppointmentPage.vue` | 页面 | 任命/调岗/免职预约命令 |
| `MemberExitPage.vue` | 页面 | 成员退出与移除 |
| `TransitionPage.vue` | 页面 | 换届管理（规划与执行） |

## 对外接口

- 路由：`/org/:clubId/members*`（`P-MEM-*`）
- 服务/Mock：`mock/index.ts` memberHandlers（`/api/org/:clubId/members*`：department-apply、invite、appointments、resignation、exit、exit-requests、transition）、`db-members.ts` / `db.ts` 数据源

## 核心逻辑摘要

- `SM-MEM-001`：`non_member → pending_effective → active → exiting → exited`；接受邀请/任命后经 Casdoor 同步确认才生效。
- `SM-MEM-002`：关系 `active → transferring → active / ended / sync_anomaly`；`syncPositionMembership` 负责 Casdoor 侧同步。
- `SM-MEM-003`：部门关系申请 `draft → under_review → approved_pending_exec → executing → effective / exec_failed`。
- `SM-MEM-004`：常规入社邀请 `sent → pending_acceptance → accepted_pending_sync → effective / sync_failed / sync_anomaly`；含 target_already_member 分支。
- 预约命令（`SM-ORG-003`）由 AppointmentPage 驱动，执行时重新鉴权发起人/确认人权限。
- 任期到期提醒经 `deliverTermEndReminders`（间隔桶去重）投递站内通知。

## 典型调用链

`AppointmentPage 创建预约命令` → `SM-ORG-003 pending_exec` → 到点执行 → `SM-MEM-001 pending_effective` → Casdoor 写 Group 回读 → `active`；成员离开走 `exit_approved → exiting → confirmed → exited`。

# 领域模块 · 联合活动

> 更新日期：2026-08-08
> 状态机：`SM-JNT-001`（联合活动）、`SM-JNT-002`（参与社团关系）、`SM-JNT-003`（联合申请）、`SM-JNT-004`（联合单次面试）、`SM-JNT-005`（参与社团结论）、`SM-JNT-006`（联合报名通道）

## 核心职责

多社团联合招新全流程：联合活动发起与参与确认、名单锁定与首次公布、联合申请、联合面试、参与社团结论、联合报名通道与跨社团邀请。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `JointManagePage.vue` | 页面 | 联合活动创建（`mode=create`）/ 管理（`mode=manage`） |
| `JointListPage.vue` / `AdminJointListPage.vue` | 页面 | 社团 / 平台联合活动列表 |
| `JointApplyPage.vue` | 页面 | 联合申请表单 |
| `JointInterviewPage.vue` / `JointInterviewSchedulePage.vue` | 页面 | 联合面试管理 / 排期 |
| `JointConclusionPage.vue` | 页面 | 参与社团结论设置与评审 |
| `JointClosePage.vue` | 页面 | 正常结束 / 强制结束 |
| `JointInvitationPage.vue` | 页面 | 联合邀请管理 |
| `jointApplyLogic.ts`（lib） | 逻辑 | 联合表单志愿/偏好、校验与提交载荷构建 |

## 对外接口

- 路由：`/org/:clubId/joint*`、`/admin/joint*`、`/activity/joint/:jointId`（公开）、`/me/interviews/joint/:jointId`
- 服务/Mock：`recruitment-api.ts` 联合端点（confirm/clubs/withdraw/publish/channel/cancel/close/applications/interviews/slots/conclusions/invitations 等）

## 核心逻辑摘要

- `SM-JNT-001`：`draft → confirmed → published → invite_phase → closing_confirm → closed`；首邀成功后永久禁止整体取消。
- `SM-JNT-002`：参与社团关系 `invited → accepted → locked`；首次公布后名单锁定，仅支持强制停用/恢复。
- `SM-JNT-003`：联合申请 `draft → submitted`，活动终态归档。
- `SM-JNT-004`：联合面试记录与普通面试类似，另含 `completed → completed_archived`（活动终态）与 `author_evaluate`。
- `SM-JNT-005`：参与社团结论 `pending → evaluating → invite_pending → accepted_locked`。
- `SM-JNT-006`：联合报名通道 `not_open / open / paused / closed`，支持延长截止与重开。
- 联合授权不通过放宽 `club_id` 过滤实现，独立建模（JNT 域）。

## 典型调用链

`JointManagePage 发起` → `/api/org/:clubId/joint` → 各社团 confirm（`SM-JNT-002`）→ 收齐转 `confirmed` → 首次公布锁定名单（`SM-JNT-001 published`）→ 联合申请（`SM-JNT-003`）→ 联合面试（`SM-JNT-004`）→ 结论与邀请（`SM-JNT-005` / `SM-INV-001`）。

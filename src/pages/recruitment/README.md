# 领域模块 · 普通招新

> 更新日期：2026-08-08
> 状态机：`SM-REC-001`（活动）、`SM-REC-002`（报名通道）、`SM-REC-003`（申请与修订）、`SM-REC-004`（部门路径与结论）、`SM-REC-005`（面试记录）

## 核心职责

普通招新活动全生命周期：活动发布/暂停/完成/取消、报名通道开放与窗口、申请草稿/提交/补充/退出/恢复、部门路径与录取结论、面试排期与记录。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `RecruitmentListPage.vue` | 页面 | 社团招新活动列表 |
| `ActivityCreatePage.vue` | 页面 | 创建活动（配置部门、资格、志愿、表单、期限） |
| `ActivityManagePage.vue` | 页面 | 活动管理（发布/暂停/完成/取消、通道与轮次） |
| `ApplicationsPage.vue` | 页面 | 申请人列表与状态管理 |
| `ApplicationPage.vue` | 页面 | 申请人表单填报 |
| `InterviewManagePage.vue` / `InterviewSchedulePage.vue` | 页面 | 面试管理 / 排期 |
| `ReviewPage.vue` | 页面 | 部门路径评价与结论 |
| `InvitationManagePage.vue` / `InvitationPage.vue` | 页面 | 招新邀请管理 / 申请人视角 |
| `MyInterviewTasksPage.vue` | 页面 | 面试官任务列表 |
| `PublicCatalogPage.vue` / `PublicDetailPage.vue` | 页面 | 公开目录与公开详情 |
| `AdminRecruitmentListPage.vue` | 页面 | 平台级活动总览 |

## 对外接口

- 路由：`/org/:clubId/recruitment*`（工作空间）、`/activity/recruitment/:activityId`（公开）、`/admin/recruitment`（平台）、`/explore*`（公开目录）、`/me/interviews/*`（面试官）
- 服务/Mock：`recruitment-api.ts` 提供 `db-recruitment.ts` 之上的 HTTP 端点（活动、通道、轮次、申请、路径、面试、评审、邀请等约 70 个）

## 核心逻辑摘要

- `SM-REC-001`：`draft → in_progress → completed / cancelled / force_completed → archived`；暂停/恢复按实际暂停时长顺延冻结截止。
- `SM-REC-002`：`not_open / open / paused / closed`，支持带新截止的重开窗口；活动整体暂停时通道保持原状态。
- `SM-REC-003`：申请状态含 `draft / submitted / revision_requested / exited / adjustment_overdue / identity_anomaly / not_qualified`；退出后可创建个人恢复窗口。
- `SM-REC-004`：部门路径 `pending → evaluating → hold / decided / waitlist / published`；结论发布后可改判（邀请未接受时）。
- `SM-REC-005`：面试 `pending_selection → scheduled → in_progress → completed / invalidated`；支持请假/迟到/缺席/换时/跳轮/作废重排。
- 状态类型统一由 `StatesOf<'SM-REC-xxx'>` 从 `transitions.ts` 派生（MRM-014 单源）。

## 典型调用链

`ActivityManagePage 发布` → `POST /api/org/:clubId/recruitment/:activityId/publish` → `SM-REC-001 draft→in_progress` → 通道开放（`SM-REC-002`）→ 申请提交（`SM-REC-003`）→ 面试（`SM-REC-005`）→ 部门结论（`SM-REC-004`）→ 邀请（`SM-INV-001`）。

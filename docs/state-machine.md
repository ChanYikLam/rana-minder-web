# RanaMinder 状态机文档

> 更新日期：2026-08-09（P2-5：SM-EXP-001 词表同步 processing / start_processing）
> 上游基线：`docs/specification/SRS-状态机转换明细-v1.0.md`（29 个状态机、306 条转换规则，位于 main 设计基线，合并到 dev 后生效）
> 代码实现：`src/mock/state-machines/transitions.ts`（精确转换表，唯一词表来源）

## 1. 通用框架

### 1.1 状态机定位

- 前端 Mock 层以 `transitions.ts` 的**精确转换表**为唯一事实来源；`STATE_MACHINE_METAS` 从转换表推导状态集合，不维护第二套硬编码枚举（MRM-014 单源）。
- `types/machine/index.ts` 定义 `StateMachineId`（29 个，`SM-xxx` 命名，对应规格的 `SRS-SM-xxx`）与转换类型。
- 所有未列出的跳转一律拒绝并保持原状态；业务前置条件校验由 db 业务函数完成，转换表负责第一道闸。

### 1.2 核心接口

| 接口 | 位置 | 职责 |
|---|---|---|
| `TRANSITIONS` | `state-machines/transitions.ts` | `{ from: { event: to } }` 精确转换表 |
| `StatesOf<M>` | 同上 | 由表派生的状态字面量类型 |
| `assertTransition(machine, from, to, event)` | 同上 | 转换合法性断言（写操作必须携带事件） |
| `isValidState / isValidTransition` | `state-machines/index.ts` | 状态/可达性查询 |
| `transitionRuleCount / totalTransitionRuleCount` | 同上 | 规则统计（306 规则集） |
| `MACHINE_NAMES` | 同上 | 状态机中文名称 |

### 1.3 校验约定

1. 写操作：`assertTransition` 通过后才执行业务前置条件与原子副作用（历史/通知/审计同事务）。
2. 读操作：仅 `isValidState` / `isValidTransition` 查询，不触发副作用。
3. db 层类型词表统一 `StatesOf<M>` 派生，禁止手写字面量联合，避免双轨漂移。
4. 显示层 `components/business/stateLabels.ts` 负责 SM-* 词表与历史显示别名的中文映射。

## 2. 29 个状态机定义

### 2.1 身份与资料（3 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-IDN-001` | 账号访问 | anonymous / authenticating / authenticated / casdoor_unconfirmable / disabled | login_success、account_disabled、casdoor_unavailable、timeout_15min、recovered_valid |
| `SM-IDN-002` | 资料写入门 | incomplete / pending_email_verification / complete / scope_restricted | save_profile、verify_success、new_required_field、scope_missing、supplemented |
| `SM-IDN-003` | 资料同步 | synced / pending_sync / retrying / pending_readback / conflict_pending / rolled_back | start_write、write_confirmed、failed_24h、readback_third_value、user_keep_local、user_accept_casdoor |

### 2.2 组织与授权（4 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-ORG-001` | 社团接入 | wizard_pending / enabled / suspended / sync_abnormal_ro / pending_rebind | complete_validation、normal_suspend、force_suspend、group_lost、repair_ok、rebind_ok、reaccess_ok |
| `SM-ORG-002` | Group 关系命令 | pending / processing / confirmed_success / failed_keep_original / pending_manual_retry | submit、confirmed_success、failed_15min、partial_compensated、manual_retry |
| `SM-ORG-003` | 预约管理命令 | pending_exec / initiator_lost_rights / precondition_failed / reconfirmed / executing / executed / exec_failed / cancelled | execute_ok、initiator_lost、precondition_lost、reconfirm、group_confirmed、external_failed、retry |
| `SM-ORG-004` | 受控批量操作 | selecting / previewing / executing / completed / partially_failed / cancelled | generate_preview、confirm、modify、all_success、partial_failed、retry_failed |

### 2.3 普通招新（5 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-REC-001` | 普通招新活动 | draft / in_progress / paused / completed / cancelled / force_completed / archived | publish、pause、resume、complete、cancel、force_complete、archive |
| `SM-REC-002` | 普通报名通道 | not_open / open / paused / closed | open、pause、resume_with_deadline、close、deadline_reached、activity_final、reopen_with_deadline |
| `SM-REC-003` | 申请与修订 | draft / submitted / revision_requested / revised / exited / adjustment_overdue / identity_anomaly / not_qualified | submit、withdraw_submission、request_supplement、rule_tightening、recovery_resubmit、not_qualified、recovered |
| `SM-REC-004` | 部门路径与结论 | pending / evaluating / hold / decided / waitlist / published | formal_volunteer、transfer_path、decide、set_label、clear_label、waitlist、publish、revise、promote_invite |
| `SM-REC-005` | 面试记录 | pending_selection / scheduled / leave / late / absent / in_progress / completed / invalidated / cancelled | select、admin_arrange、reschedule、leave、late、absent、start、complete、invalidate、rearrange、skip_round |

### 2.4 联合活动（6 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-JNT-001` | 联合活动 | draft / confirmed / published / invite_phase / closing_confirm / closed / cancelled / force_closed | confirm_all、first_publish、first_invite、all_invites_final、collect_cancel、force_close、deadline_expired |
| `SM-JNT-002` | 参与社团关系 | invited / accepted / confirm_pending / locked / force_suspended / removed | confirm、list_changed、deadline_expired、withdraw、first_publish、force_suspend、re_enable |
| `SM-JNT-003` | 联合申请 | draft / submitted / archived | save、submit、submit_without_consent、activity_final、withdraw、club_suspend |
| `SM-JNT-004` | 联合单次面试记录 | pending_selection / scheduled / leave / late / absent / in_progress / completed / invalidated / cancelled_archived / completed_archived | select、start、complete、author_evaluate、invalidate、rearrange、activity_final |
| `SM-JNT-005` | 参与社团结论 | pending / evaluating / invite_pending / accepted_locked / archived | create、modify、create_invite、invite_terminal、accepted、force_invalidated、activity_final |
| `SM-JNT-006` | 联合报名通道 | not_open / open / paused / closed | first_open、extend、manual_close、deadline_reached、resume_with_deadline、reopen_with_deadline |

### 2.5 邀请与成员（4 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-INV-001` | 邀请（普通/联合/招新共用） | draft / pending_acceptance / accepted / effective / sync_failed / rejected / withdrawn / expired | send、accept、reject、withdraw、expire、casdoor_sync_ok、sync_fail、reissue |
| `SM-MEM-001` | 成员经历 | non_member / pending_effective / active / exiting / exited / sync_anomaly | accept_invite、appoint、confirmed、failed_15min、compensated、exit_approved、removed、external_removed |
| `SM-MEM-002` | 部门/职位关系 | active / transferring / ended / sync_anomaly | start_change、end_change、confirmed、failed_compensated、failed、external_change、manual_fix |
| `SM-MEM-003` | 部门关系申请 | draft / under_review / withdrawn / rejected / approved_pending_exec / executing / effective / exec_failed | submit、withdraw、reject、approve、execute、confirmed、failed、retry |
| `SM-MEM-004` | 常规入社邀请 | sent / pending_acceptance / accepted_pending_sync / effective / sync_failed / sync_anomaly / rejected / withdrawn / expired / target_already_member | send、accept、confirmed、retryable_fail、compensated、unrecoverable、reissue |

### 2.6 表单 / 文件 / 通知 / 审计 / 导出（5 个）

| 状态机 | 对象 | 状态集 | 关键事件 |
|---|---|---|---|
| `SM-FORM-001` | 表单定义 | draft / published / deprecated | publish、preview_test、deprecate、reuse、clone |
| `SM-FORM-002` | 表单提交 | draft / checking / submitted / revision / locked / deleted | migrate、submit_request、all_pass、fail_or_unavailable、edit_allowed、lock、correction_approved |
| `SM-FILE-001` | 文件 | uploading / checking / approved / quarantined / bound / pending_cleanup / deleted | complete、pass、danger、service_unavailable、bind_submit、no_refs、cleaned、formal_delete |
| `SM-NTF-001` | 通知事实/渠道 | pending / delivered / read / paused / failed | deliver、pause、resume、email_success、email_failed_24h、read |
| `SM-AUD-001` | 纠错 | draft / submitted / overdue / approved / rejected / withdrawn / executed | submit、approve、reject、withdraw、deadline、execute |
| `SM-EXP-001` | 导出任务 | pending / generating / processing / completed / failed / denied / expired / deleted | start、start_processing、success、fail、lose_rights、expire、download、delete、formal_delete_hit、retry |

## 3. 跨状态机联动要点

- 邀请（`SM-INV-001` / `SM-MEM-004`）接受后驱动成员生效（`SM-MEM-001 pending_effective`），Casdoor 写 Group 回读确认前不开放权限。
- 招新活动终态（`SM-REC-001`）联动通道（`SM-REC-002` → closed）、路径（`SM-REC-004` → 归档只读）与面试（`SM-REC-005` → cancelled）。
- 联合活动终态（`SM-JNT-001`）联动申请归档（`SM-JNT-003`）、结论归档（`SM-JNT-005`）、通道关闭（`SM-JNT-006`）。
- 预约关系命令（`SM-ORG-003`）执行阶段复用 `SM-ORG-002` 的回读/重试/补偿语义。
- 表单提交（`SM-FORM-002`）与文件（`SM-FILE-001`）绑定：未检查文件不可进入正式提交。
- 纠错（`SM-AUD-001` executed）不改写不可变历史，仅产生纠错链。

## 4. 验证

- `src/mock/state-machines/spec-306.test.ts`：断言 29 个状态机存在、规则总数 ≥ 306、关键状态机规则数稳定、`isValidState/isValidTransition/assertTransition` 三方一致。
- `src/mock/db-*.test.ts` 与 `recruitment-apply/review` 等测试覆盖各状态机的正向/负向转换。
- 所有状态经 `stateLabels.ts` 提供中文显示与语义色（success/danger/warning/info/neutral）。

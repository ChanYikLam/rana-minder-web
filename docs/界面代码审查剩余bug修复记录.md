# 界面代码审查剩余 Bug 修复记录

- **来源文档**：`docs/governance/界面代码审查报告-v1.0.md`（审查基准 `dev @ 1fefd7f`）
- **修复分支**：`fix/ui-review-v1-remaining`（基于最新 `dev` @ `a22b2bd`）
- **核对基线**：报告 149 项（P0×3 / P1×26 / P2×55 / P3×65）中，截至 `a22b2bd` 已由历史 MR 修复约 25 项；本分支负责修复剩余项
- **规则**：每个 bug 修复后运行 `pnpm typecheck`、`pnpm lint` 及关联单测（`pnpm test <相关测试文件>`），验证通过后在下方记录

---

## 修复进度总览

| 批次 | 范围 | 计划项 | 完成 | 测试通过 |
|---|---|---|---|---|
| 批次1 | P1 残余 + 202 操作分支 + IFC-ERR-013 | 15 | 0 | 0 |
| 批次2 | P2 高价值项 | 25 | 0 | 0 |
| 批次3 | P3 清理 | 30 | 0 | 0 |

---

## 批次1：P1 残余

### P1-18 joint/JointConclusionPage 同名串号
- **状态**：待修复
- **问题**：结论页以 applicantName 作为分组与邀请关联 key，同名申请人数据串号
- **修复方案**：改为以 applicantId 分组/关联邀请
- **测试**：-

### P1-19 recruitment/InterviewManagePage 切换活动不重载
- **状态**：待修复
- **问题**：路由切换只重载面试列表，bookOptions（轮次/申请人）与面试官任务残留上一活动数据
- **修复方案**：watch 中同步重载 loadBookOptions / loadInterviewers，加载带活动参数
- **测试**：-

### P1-20 recruitment/InterviewManagePage 跳轮轮次错取
- **状态**：待修复
- **问题**：跳轮/免试 roundId 取自代预约表单 `bookForm.roundId` 或 `rounds[0]`，无独立轮次选择器，多轮次活动可跳错轮次
- **修复方案**：跳轮操作弹窗/确认框内提供轮次选择器，独立于代预约表单
- **测试**：-

### P1-13 member/MemberExitPage 自审拦截缺失（辞职审批）
- **状态**：待修复
- **问题**：退出审批 DB 层已拦自审（db.ts:786）但前端仍渲染本人审批按钮；辞职审批（db.ts:869 及路由）完全无自审拦截
- **修复方案**：前端审批按钮隐藏本人申请；DB 层 decideResignationRequest 增加 actor 自审校验
- **测试**：-

### P1-14 notification/EmailSettingsPage 发信密钥无法录入
- **状态**：待修复
- **问题**：密码框 readonly 恒空，rotate-key 只是绕过，无真正录入入口
- **修复方案**：移除 readonly，使密码框可编辑并纳入 POST body
- **测试**：-

### P1-15 notification/EmailSettingsPage 偏好加载失败静默
- **状态**：待修复
- **问题**：personal 偏好加载失败无提示，保存时以空对象覆写服务端其余偏好
- **修复方案**：加载失败置错误态并阻断保存，成功后才允许保存
- **测试**：-

### P1-16 organization/ClubManagePage 重绑无确认
- **状态**：待修复
- **问题**：handleRebind 自动选取同名首个候选直接重绑，无确认展示
- **修复方案**：先弹出候选确认（展示将绑定的 Group 名称/ID），确认后再执行
- **测试**：-

### P1-17 form/FormDesignerPage 无未保存更改保护
- **状态**：待修复
- **问题**：无 dirty 追踪、无 beforeRouteLeave 提醒，改字段后直接发布发旧版
- **修复方案**：dirty 追踪 + 发布前校验未保存更改 + onBeforeRouteLeave 离开提醒
- **测试**：-

### P1-21 recruitment/ApplicationPage 网络错误静默当"无申请"
- **状态**：待修复
- **问题**：IFC-ERR-015/003 已区分，但网络异常（IFC-ERR-016 等）仍静默置为"无申请"
- **修复方案**：仅对 015/003 降级处理，其余错误进入 error 态并显示重试
- **测试**：-

### P1-22 member/AppointmentPage 末位负责人守卫只拦 dismiss
- **状态**：待修复
- **问题**：isLastLeader 仅对 dismiss 生效，appoint/transfer 可致零负责人窗口
- **修复方案**：canExecute 对 appoint/transfer 同样校验末位负责人
- **测试**：-

### P1-23 components/form/DynamicForm resolving/migrating 永不复位
- **状态**：待修复
- **问题**：resolving/migrating 置 true 后无复位逻辑；调用方不传 props，冲突/迁移 UI 为死代码
- **修复方案**：提供 emit 复位机制（resolve 完成/取消后复位），或改为函数式暴露；三个调用方按需接入
- **测试**：-

### P1-24 layouts/DefaultLayout 移动端侧栏双栏渲染
- **状态**：待修复
- **问题**：桌面侧栏缺 `hidden lg:flex`，移动端与抽屉同时渲染
- **修复方案**：aside 增加 `hidden lg:flex`
- **测试**：-

### 202/accepted 操作分支残余（P1 系统性）
- **状态**：待修复
- **问题**：member 5 页（AppointmentPage/DepartmentApplyPage/MemberExitPage/MembershipInvitePage/TransitionPage 部分操作）、InterviewManagePage 多操作分支、InvitationPage handleSyncConfirm 仍将 accepted 落入 toastError 误报
- **修复方案**：统一在这些分支前补 `result.kind === 'accepted'` → `toastAcceptedAction` 处理
- **测试**：-

### IFC-ERR-013 映射无页面消费
- **状态**：待修复
- **问题**：error-map.ts 将 013 映射为 external_uncertain，但无页面处理该分支，实际落入 else 误报
- **修复方案**：在 toastError 工具或错误映射层统一处理 external_uncertain（降级为"处理中"提示）
- **测试**：-

---

## 批次2：P2 高价值项

（待批次1完成后逐项登记）

---

## 批次3：P3 清理

（待批次2完成后逐项登记）

---

## 修复提交记录

| 提交 | 内容 | 测试 |
|---|---|---|
| - | - | - |

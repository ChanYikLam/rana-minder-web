# 领域模块 · 通知

> 更新日期：2026-08-08
> 状态机：`SM-NTF-001`（通知事实/渠道）

## 核心职责

通知事实、收件人快照、站内信与邮件渠道投递、去重、订阅偏好、开关（kill-switch）、邮件配置与密钥轮换。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `NotificationCenterPage.vue` | 页面 | 站内信中心（列表 / 未读 / 全部已读） |
| `EmailSettingsPage.vue` | 页面 | 邮件配置（平台 `scope=platform` / 社团 `scope=club`） |
| `notifications.ts` | 数据层 | 通知事实、模板、偏好、邮件发件箱、配置与去重 |
| `notificationViewStore.ts`（state） | 状态 | 未读数与列表缓存 |
| `NotificationBadge.vue` / `NotificationDetail.vue`（components/feedback） | 组件 | 顶栏未读徽标与详情 |

## 对外接口

- 路由：`/me/notifications`、`/me/notifications/preferences`、`/org/:clubId/notifications/email-config`、`/admin/notifications/email-config`、`/admin/notifications/preferences`、kill-switch 端点
- 服务/Mock：`notificationApi`（list/markRead/markAllRead/getUnreadCount）；`/api/me/notifications*`、`/api/org/:clubId/notifications*`、`/api/admin/notifications*`

## 核心逻辑摘要

- `SM-NTF-001`：`pending → delivered → read`；支持 paused、fail_retry、email_failed_24h → failed。
- 通知事实与业务结果同一本地原子提交；邮件投递为提交后执行，不回滚普通权益业务（SRS-FAIL-007/008）。
- `pushNotification` 模板渲染 + 5 分钟去重窗口（`DEDUP_WINDOW_MS`）；kill-switch 可平台/社团两级关闭。
- 邮件配置分离平台/社团两套密钥，支持测试、轮换；邮箱验证码 24 小时有效（`SM-IDN-002`）。
- 权益通知不可丢：业务成功必须伴随通知事实持久化（NTF-001 至 003）。

## 典型调用链

`领域命令提交` → 同事务写入通知事实 + 收件人快照（`SM-NTF-001 pending`）→ 站内信投影 + 可选邮件投递任务 → 渠道结果回写（delivered/failed）→ 用户已读（read）。

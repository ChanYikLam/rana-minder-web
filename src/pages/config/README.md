# 领域模块 · 配置与发布

> 更新日期：2026-08-08
> 相关状态机：`SM-FORM-001`（权限模板等版本对象复用）、`SM-ORG-001`（社团配置生效范围）

## 核心职责

平台/社团默认值、活动快照、学年、权限模板与安全开关的版本管理、发布与生效范围控制。已发布版本不可原地覆盖。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `ConfigPage.vue` | 页面 | 平台配置（`/admin/config`）与社团配置（`/org/:clubId/config`） |
| `PermissionTemplatePage.vue` | 页面 | 权限模板管理（保存/差异对比/发布） |
| `db-organization.ts`（GroupTemplateMapping） | 数据层 | 职位/部门模板映射 |
| `governance.ts` | 治理 | 安全开关、OIDC 配置、真实数据开关 |

## 对外接口

- 路由：`/org/:clubId/config`、`/admin/config`、`/admin/config/permission-templates`
- 服务/Mock：`/api/org/:clubId/config`、`/api/admin/config*`、`/api/admin/config/permission-templates*`

## 核心逻辑摘要

- 权限模板发布为高风险命令（`permission_template_publish`），需重认证；发布前 diff 影响。
- 配置版本不可原地覆盖；发布采用不可变版本 + 生效范围（ADR-010 单文件外置配置，Docker 只读挂载）。
- 活动快照/学年等配置被招新、表单、期限派生引用，切换使用旧版本直到新版本发布生效。
- OIDC 安全配置（`updateOidcConfig`）与真实数据开关（`setRealDataSwitch`）受治理面保护。

## 典型调用链

`PermissionTemplatePage 保存模板` → diff 预览 → `publish`（重认证）→ 模板生效；`ConfigPage` 保存社团配置 → 后续活动创建读取最新配置快照。

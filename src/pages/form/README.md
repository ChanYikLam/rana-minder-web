# 领域模块 · 动态表单与文件

> 更新日期：2026-08-08
> 状态机：`SM-FORM-001`（表单定义）、`SM-FORM-002`（表单提交）、`SM-FILE-001`（文件）

## 核心职责

动态表单定义/不可变版本/发布/废止/复用/克隆，表单提交与修订、字段权限与业务快照；附件上传/检查/绑定/访问/清理，遵循「先检查后访问」。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `FormListPage.vue` / `AdminFormListPage.vue` | 页面 | 社团 / 平台表单列表 |
| `FormDesignerPage.vue` | 页面 | 表单设计器（字段编排、权限、条件逻辑） |
| `FormVersionPage.vue` | 页面 | 版本管理与发布历史 |
| `FilePreviewPage.vue` | 页面 | 文件预览（检查通过后） |
| `DynamicForm.vue`（components/form） | 组件 | 动态表单渲染 |
| `db-forms.ts` | 数据层 | 表单定义/版本/提交的 Mock 内存库 |
| `formFile.ts`（lib） | 逻辑 | 文件字段填充校验、草稿安全元数据 |

## 对外接口

- 路由：`/org/:clubId/forms*`、`/admin/forms*`
- 服务/Mock：`/api/org/:clubId/forms/*`、`/api/admin/forms/*`、`/api/files/upload`、`/api/files/:fileId`、`/api/files/:fileId/download`
- 依赖：`components/form/AttachmentUpload.vue`、`lib/formFile.ts`、`mock-plugin.ts` 的 multipart 解析

## 核心逻辑摘要

- `SM-FORM-001`：`draft → published → deprecated`；deprecated 可 reuse/clone 回 draft。
- `SM-FORM-002`：提交 `draft → checking → submitted`；支持 revision 修订、lock 锁定、correction_approved 保持 locked（纠错不改写快照）。
- `SM-FILE-001`：`uploading → checking → approved / quarantined`；approved 可 bind_submit 或待清理；未检查文件不可预览/下载/正式绑定。
- 文件字节与元数据分离：字节在对象存储（S3 兼容），PostgreSQL 存元数据（ADR-008）；Mock 层模拟检查与预览。
- 动态答案以 JSONB 存储，强类型领域对象与动态答案分离（ADR-006）。

## 典型调用链

`FormDesignerPage 保存草稿` → `POST /api/org/:clubId/forms/designer/:formId/save` → 发布（`SM-FORM-001 published`）→ 申请人经 `DynamicForm` 提交 → `SM-FORM-002 submitted`；附件经 `/api/files/upload` → `SM-FILE-001 checking` → approved 后绑定。

# Bug 修复文档：申请人上传的附件面试官无法查看

> 严重级别：P1 | 模块：招新（REC）/ 评价与结论 | 日期：2026-08-08

## 一、Bug 概述

面试官在评价申请人时，无法查看申请人提交的报名表单内容及附件文件，导致面试官缺乏决策依据（如作品集、简历等）。

## 二、影响范围

- 普通招新（REC）：ReviewPage 评价流程
- 联合招新（JNT）：JointConclusionPage 结论流程（同类问题）
- 受影响角色：interviewer（面试官）、department_leader（部门负责人）

## 三、根因分析（4 层）

### 3.1 API 权限拦截（主因）

**文件：** `src/mock/recruitment-api.ts:627`
**接口：** `GET /api/org/:clubId/recruitment/:activityId/applications/:applicantId`

该接口返回 `answers` 字段（包含附件 fileId），但权限校验仅允许 `club:recruitment:manage`：

```js
if (!canManageRec(url, query.clubId)) return forbidden()
```

面试官仅有 `club:interview:view` + `club:interview:evaluate`（见 `src/mock/auth.ts:170-173`），访问时返回 403。

### 3.2 ReviewPage 不展示申请表单数据

**文件：** `src/pages/recruitment/ReviewPage.vue`

面试官评价页面仅从 `/reviews` 接口加载评分/评语，不加载申请表单答案与附件，选中申请人后无任何附件展示区域。

### 3.3 只读视图无附件下载链接

**文件：** `src/pages/recruitment/ApplicationPage.vue:135`

已提交的只读回显中，文件字段仅返回文字"已上传附件"，未渲染为可点击链接跳转至 `/files/:fileId`（FilePreviewPage）：

```js
if (field?.type === 'file') return '已上传附件'
```

### 3.4 文件状态不一致

**文件：** `src/mock/index.ts:2256`

文件元数据接口返回 `status: 'clean'`，但 FilePreviewPage（`src/pages/form/FilePreviewPage.vue:126`）要求 `status === 'approved'` 才显示下载按钮，导致即使进入预览页也无法下载。

注：`recruitment-api.ts:1408` 注册了同一路由返回 `'approved'`，两个 mock handler 冲突。

## 四、修复方案

### 4.1 放宽申请详情接口权限

**文件：** `src/mock/recruitment-api.ts:627`

将权限校验从仅 `canManageRec` 改为 `canManageRec || canInterview`，并增加面试工作区范围校验（轮次级任务仅可见其轮次申请人）。

### 4.2 ReviewPage 增加申请表单展示

**文件：** `src/pages/recruitment/ReviewPage.vue`

选中申请人后，额外调用申请详情接口加载 `answers`，渲染表单答案；文件字段渲染为 `<router-link :to="/files/{fileId}">` 跳转至 FilePreviewPage。

### 4.3 只读视图渲染附件链接

**文件：** `src/pages/recruitment/ApplicationPage.vue:131-137`

修改 `answersOf` 函数，文件类型字段返回带链接的 HTML 而非纯文字"已上传附件"。

### 4.4 统一文件状态

**文件：** `src/mock/index.ts:2256`

将 `status: 'clean'` 改为 `status: 'approved'`，与 FilePreviewPage 的判断条件一致。

## 五、验证清单

- [ ] 面试官角色访问申请详情接口返回 200（非 403）
- [ ] ReviewPage 选中申请人后可见表单答案
- [ ] 文件字段可点击跳转至 FilePreviewPage
- [ ] FilePreviewPage 显示下载按钮（status=approved）
- [ ] 普通管理员（club:recruitment:manage）功能不受影响
- [ ] 轮次级临时面试官仅可见其轮次申请人

## 六、数据流

```
申请人上传 -> /files/upload -> fileId 存入 answers -> 提交申请
                                                        |
面试官查看 -> ReviewPage（缺展示）-> 申请详情 API（403）-> 无法获取 fileId
                                                        |
即使获得 fileId -> /files/:fileId -> status='clean'≠'approved' -> 无下载按钮
```

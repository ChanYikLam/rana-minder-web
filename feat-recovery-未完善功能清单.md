# RanaMinder 前端 feat/recovery 分支未完善功能清单

> 对比基准：`D:\liudawenjian\Downloads\RanaMinder-docs (1)\docs` 全套文档（需求规格、PRD、SRS、UI/UX设计规范、组件规范、页面状态矩阵、技术设计、实现准备评审）  
> 对比目标：`d:\liudawenjian\Desktop\test1` 仓库 feat/recovery 分支当前代码  
> 日期：2026-08-02  
> 变更范围：**仅列出，不修改代码**

---

## 一、缺失业务组件（29 个，完成度 0%）

规范文档（[组件规范与开发标注-v1.0.md](D:\liudawenjian\Downloads\RanaMinder-docs (1)\docs\frontend\组件规范与开发标注-v1.0.md) 与 [前端UIUX设计规范-v1.0.md](D:\liudawenjian\Downloads\RanaMinder-docs (1)\docs\frontend\前端UIUX设计规范-v1.0.md) 第 5 章）规划了以下 29 个可复用业务组件，当前代码中**全部未实现**，相关功能内联在页面中，导致跨页面代码重复。

### 1.1 导航与布局组件（5 个缺失）

| 组件 | 规范要求 | 影响范围 |
|------|---------|---------|
| **TopNav** | 顶部导航栏：品牌区 + 主导航 + 通知图标 + 用户菜单 + 主题切换（双主题方案获批后） | 当前在 DefaultLayout.vue 中硬编码，无独立组件 |
| **ClubIndicator** | 当前社团指示器：固定显示社团名 + 切换入口，primary-subtle 背景 | 当前在 DefaultLayout.vue 中内联 |
| **SideNav** | 侧边栏：L3 模块导航，xs 抽屉，选中项 primary-subtle | 当前在 DefaultLayout.vue 中内联，无独立组件 |
| **Breadcrumb** | 面包屑：路径回溯，text-secondary | 完全缺失 |
| **ContentContainer** | 内容容器：最大宽度 1400px，居中 | 完全缺失 |

### 1.2 状态与反馈组件（8 个缺失）

| 组件 | 规范要求 | 影响范围 |
|------|---------|---------|
| **ProcessingTag** | 处理中标记：外部写入处理中时显示 warning subtle + 旋转图标 | 完全缺失 |
| **NotificationBadge** | 通知角标：未读数，accent 背景，text-on-accent | 完全缺失 |
| **ErrorState** | 错误态：业务拒绝、降级、不可用，danger 文字 + 重试操作 | 当前由 PageStateBoundary 部分覆盖，但无独立组件 |
| **DegradedBanner** | 降级提示条：Casdoor 故障 15 分钟窗口、站内信关闭、数据库不可用 | 完全缺失，SRS-FAIL-001/002 要求 |
| **Banner** | 消息横幅：降级、异常、维护公告 | 完全缺失 |
| **NotificationDetail** | 通知详情：事件摘要、跳转入口 | 完全缺失 |
| **SyncIndicator** | 已实现 ✅ | — |
| **StatusBadge** | 已实现 ✅ | — |

### 1.3 表单与输入组件（7 个缺失）

| 组件 | 规范要求 | 影响范围 |
|------|---------|---------|
| **DynamicForm** | 动态表单引擎：按表单版本渲染字段，条件隐藏由服务端重算 | 完全缺失，FormDesignerPage 只有设计器，无独立引擎 |
| **FieldPermission** | 字段权限标识：标注字段读写权限来源 | 完全缺失 |
| **AttachmentUpload** | 附件上传：类型与大小检查、恶意内容检查状态 | 完全缺失，ApplicationPage 中内联实现 |
| **ObjectPicker** | 对象选择器：人员、社团、部门、职位 Group 选择 | 完全缺失 |
| **DateTimePicker** | 日期时间选择器：面试排期、截止、有效期，时区按平台配置 | 完全缺失 |
| **PreferenceSorter** | 志愿排序器：拖拽 + 上移/下移 + 键盘操作 | 完全缺失 |
| **NameSearch** | 名称搜索框：中文连续子串、受控错别字近似、分层结果 | 完全缺失，PRD-OPT-010 要求 |

### 1.4 操作与确认组件（6 个缺失）

| 组件 | 规范要求 | 影响范围 |
|------|---------|---------|
| **ConfirmScope** | 高风险操作前的影响范围确认：目标社团、实际影响范围、预计通知对象 | 完全缺失，HighRiskConfirm 已实现但 ConfirmScope 是独立组件 |
| **ImpactPreview** | 影响预览面板：目标对象清单、社团、部门、通知范围、不可逆边界 | 完全缺失 |
| **BatchActionBar** | 批量操作栏：选类型、预览固定清单、逐项执行、部分成功 | 完全缺失 |
| **PartialSuccess** | 部分成功结果：成功项保留、失败项逐条原因、单独重试 | 完全缺失 |
| **DangerButton** | 危险操作按钮：danger 色、二次确认 | 完全缺失 |
| **WithdrawAction** | 撤回操作：申请、邀请、纠错撤回（决定提交前） | 完全缺失 |

### 1.5 数据展示组件（3 个缺失）

| 组件 | 规范要求 | 影响范围 |
|------|---------|---------|
| **FilterPanel** | 筛选面板：结构化筛选、名称搜索、截止快捷范围 | 完全缺失 |
| **ApplicantCard** | 申请人卡片：申请人摘要、志愿、状态、面试记录 | 完全缺失 |
| **Timeline** | 时间线：成员经历、任期、纠错链、状态变更历史 | 完全缺失 |
| **ScheduleView** | 面试日程视图：日历与列表双视图、冲突检测提示 | 完全缺失 |
| **StatChart** | 统计图表：成员、招新、部门统计，小样本保护，社团隔离 | 完全缺失（StatsPage 内联简易柱状图替代） |

---

## 二、页面级功能缺陷（4 项）

### 2.1 状态机转换校验不完整

| 文件 | 问题 | 规范要求 |
|------|------|---------|
| [src/mock/state-machines/transitions.ts](file:///d:/liudawenjian/Desktop/test1/src/mock/state-machines/transitions.ts) | 当前仅检查源/目标状态是否在合法枚举中，未实现 SRS 规范的 306 条精确转换规则 | SRS 状态机转换明细 v1.0，29 个状态机，306 条转换规则 |

### 2.2 页面内联 Mock 数据

| 文件 | 问题 | 规范要求 |
|------|------|---------|
| [LoginPage.vue](file:///d:/liudawenjian/Desktop/test1/src/pages/auth/LoginPage.vue) | 硬编码 6 个演示角色供 Mock 登录选择 | 不应在业务页面中硬编码演示数据 |
| [BatchOperationPage.vue](file:///d:/liudawenjian/Desktop/test1/src/pages/organization/BatchOperationPage.vue) | 批量操作选择列表使用 `mockApplicants` 静态数据，未从 API 获取 | 应从 API 获取当前作用域的可选对象 |

### 2.3 功能未完成

| 文件 | 问题 | 规范要求 |
|------|------|---------|
| [PermissionTemplatePage.vue](file:///d:/liudawenjian/Desktop/test1/src/pages/config/PermissionTemplatePage.vue) | `saveDraft()` 只更新本地状态，未调用 API | 应调用后端 API 保存草稿 |

---

## 三、Casdoor 故障降级方案缺失

根据 SRS-FAIL-001/002 和 PRD-OPT-048：

| 要求 | 当前状态 |
|------|---------|
| 故障前已登录且 < 15 分钟：最小白名单模式（公开页面 + 查看本人基础资料 + 编辑故障前已存在的表单草稿非附件字段） | ❌ 未实现 |
| 故障 ≥ 15 分钟：除公开页面外全部关闭，展示降级页 P-GEN-03 | ❌ Casdoor 降级检测逻辑未实现 |
| 恢复后：正常恢复，提示用户重新操作 | ❌ 未实现 |
| DegradedBanner 组件 | ❌ 未实现（见 1.2） |

---

## 四、缺失的通用交互模式

| 交互模式 | 规范来源 | 当前状态 |
|---------|---------|---------|
| 键盘可达（所有操作可通过键盘完成） | UI/UX 设计规范 5.7 | ❌ 未验证 |
| 同步冲突本人选择（第三值冲突并列展示，用户选择） | UI/UX 设计规范 5.7 | ❌ ProfilePage 有同步状态显示但无完整冲突选择 UI |
| 版本冲突处理（提交时版本不匹配，展示最新值，刷新后重新提交） | UI/UX 设计规范 5.7 | ❌ 部分实现，useForm 有版本冲突处理但 UI 未完整 |
| 外部处理中（Casdoor 写入处理中显示 ProcessingTag） | UI/UX 设计规范 5.7 | ❌ ProcessingTag 未实现 |
| 权限驱动渲染（页面加载后按服务端能力渲染） | UI/UX 设计规范 5.7 | ⚠️ 部分实现（PermissionGuard 已实现） |

---

## 五、响应式适配未完成

规范要求（[组件规范 2.12](D:\liudawenjian\Downloads\RanaMinder-docs (1)\docs\frontend\组件规范与开发标注-v1.0.md)）：

| 页面族 | 窄屏行为 | 当前状态 |
|--------|---------|---------|
| 列表 | 筛选进入抽屉，行转卡片或可展开行 | ❌ 未实现 |
| 表单 | 分栏改单列，错误摘要和步骤状态置顶 | ❌ 未实现 |
| 工作台 | 指标与待办纵向堆叠，当前作用域持续显示 | ❌ 未实现 |
| 高风险命令 | 影响预览、重新认证、确认和分项结果纵向排列 | ❌ 未实现 |
| 详情/结果 | 摘要与权威状态置顶，分区按需折叠 | ❌ 未实现 |

---

## 六、可访问性未验证

规范要求（WCAG 2.2 AA 数值级别）：

| 要求 | 当前状态 |
|------|---------|
| 键盘可达性（所有操作可通过键盘完成） | ❌ 未验证 |
| 焦点管理（Dialog 焦点圈定、关闭后恢复） | ⚠️ HighRiskConfirm 已实现部分，其余未验证 |
| 非纯颜色提示（状态图标 + 文字 + 颜色三重表达） | ⚠️ 部分组件已实现，未全面验证 |
| 对比度实测 | ❌ 未验证 |
| prefers-reduced-motion 适配 | ❌ 未实现 |
| 读屏/ARIA 属性 | ⚠️ 部分组件有 aria 属性，未全面验证 |

---

## 七、工程门禁未完成

| 门禁 | 状态 | 说明 |
|------|------|------|
| FE-GATE-002 可复现安装 | ❌ 未执行 | 需在全新目录 `pnpm install --frozen-lockfile` 成功 |
| FE-GATE-003 类型与构建 | ❌ 未执行 | typecheck 与生产构建通过 |
| FE-GATE-004 组件可访问性 | ❌ 未执行 | 阻塞缺陷为 0 |
| FE-GATE-005 动态表单 | ❌ 未执行 | 嵌套数组、条件字段、字段权限等 |
| FE-GATE-006 错误适配 | ❌ 未执行 | 16 类逻辑错误契约测试 |
| FE-GATE-007 依赖治理 | ❌ 未执行 | 许可证、漏洞、包体、浏览器目标 |

---

## 八、统计汇总

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 43 个页面文件与路由 | **100%** | 全部页面 ID 有对应 Vue 文件 |
| 页面 API 调用 | **100%** | 27/27 检查页面均使用真实 API 调用 |
| 公共组件（common） | **10/10** | Button, Card, DataTable, EmptyState, HighRiskConfirm, Input, PageStateBoundary, ResponsiveActionRegion, StatusBadge, SyncIndicator |
| 业务组件（business） | **3/3** | PermissionGuard, RoleBadge, StateTag |
| 规划业务组件（规范需 29 个） | **0/29** | 全部缺失 |
| 状态机转换规则 | **0/306** | 仅简化校验 |
| Casdoor 降级方案 | **0%** | 未实现 |
| 响应式适配 | **0%** | 未实现 |
| 可访问性验证 | **0%** | 未验证 |
| 工程门禁 | **1/7** | 仅 FE-GATE-001 通过 |

---

## 九、优先级建议

| 优先级 | 类别 | 说明 |
|--------|------|------|
| **P0 高** | 状态机转换规则 | 306 条精确规则未实现，高风险操作可能放行不合规状态转换 |
| **P0 高** | Casdoor 故障降级 | 安全合规要求，SRS-FAIL-001/002 强制 |
| **P1 中** | 缺失业务组件 | 29 个组件未实现，导致跨页面代码重复，需逐步抽取 |
| **P1 中** | 页面级功能缺陷 | 4 项（Mock 数据、未完成 API） |
| **P2 低** | 响应式适配 | 移动端关键操作不得缺失 |
| **P2 低** | 可访问性 | WCAG 2.2 AA 数值级别 |
| **P3 工程** | 工程门禁 | 依赖锁文件、类型检查、构建验证 |
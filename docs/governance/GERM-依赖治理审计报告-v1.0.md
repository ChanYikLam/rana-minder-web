# GERM 依赖治理审计报告 v1.0

> 对应 FE-GATE-007：治理（Governance）、暴露（Exposure）、风险（Risk）、维护（Maintenance）

## 审计日期

2026-08-03

## 审计范围

`rana-minder-web` 前端项目 — `feat/supplement` 分支

## 1. 漏洞扫描 (npm audit)

| 严重级别 | 数量 |
|---|---|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 1 |
| **总计** | **1** |

### Low 漏洞详情

| 包名 | 版本范围 | CVE | 描述 |
|---|---|---|---|
| esbuild | 0.27.3 - 0.28.0 | GHSA-g7r4-m6w7-qqqr | Windows 开发服务器任意文件读取 |

**处置**: 仅影响本地开发服务器，不影响生产构建。可升级至 esbuild >= 0.28.1 修复。

## 2. 许可证审计

所有直接依赖许可证均为宽松许可证，无 Copyleft（GPL 系列）风险：

| 许可证 | 代表包 |
|---|---|
| MIT | vue, vite, pinia, vue-router, reka-ui, tailwindcss, zod, vitest, shadcn-vue, vee-validate, @vueuse/core, lucide-vue |
| Apache-2.0 | typescript, class-variance-authority |
| ISC | @lucide/vue (部分图标) |
| UNLICENSED | rana-minder-web (本项目，私有) |

**结论**: 无许可证合规风险。

## 3. 包体分析

### 生产构建 (vite build)

| 指标 | 值 |
|---|---|
| 总产物数 | 104 chunks |
| 主包体积 | 355.83 KB (gzip: 111.67 KB) |
| 总体积 | ~700 KB (gzip: ~250 KB) |
| 构建时间 | ~14s |

### 直接依赖数

| 类型 | 数量 |
|---|---|
| 生产依赖 | 28 |
| 开发依赖 | 17 |
| 传递依赖总计 | 626 |

**结论**: 包体在合理范围内，无体积异常依赖。

## 4. 浏览器目标

| 浏览器 | 最低版本 |
|---|---|
| Chrome | 108 |
| Edge | 108 |
| Safari | 16 |
| Firefox | 116 |

配置来源: `vite.config.ts` → `build.target`

## 5. 审计结论

| 检查项 | 状态 | 说明 |
|---|---|---|
| 高危漏洞 | 通过 | 0 Critical, 0 High |
| 中危漏洞 | 通过 | 0 Moderate |
| 低危漏洞 | 关注 | 1 Low (esbuild, 仅 dev) |
| 许可证合规 | 通过 | 无 GPL/AGPL 等 Copyleft 许可证 |
| 包体正常 | 通过 | 主包 355KB gzip 111KB |
| 浏览器目标 | 通过 | 4 大浏览器明确配置 |

**FE-GATE-007 状态**: READY — 低危 esbuild 漏洞仅影响 Windows 开发服务器，无生产风险，建议后续升级 esbuild 版本。
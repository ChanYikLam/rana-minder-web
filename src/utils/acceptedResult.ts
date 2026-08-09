import { toast } from 'vue-sonner'

/**
 * accepted（HTTP 202 / IFC-ERR-013 / IFC-ERR-014）异步受理结果统一处理。
 *
 * 背景：services/client.ts 已把 202 与 IFC-ERR-013/014 映射为 `accepted` 分支并携带 taskId，
 * 但此前各页面一律落入 else 误报"操作失败"或静默无反馈（见界面代码审查报告 P1-1，涉及 15+ 页面）。
 *
 * 本工具提供两类统一降级：
 * - 操作类（POST/PUT/DELETE）受理：提示"已受理"，避免引导用户重复提交；
 * - 加载类（GET）受理：提示加载中，页面应让出 loading 态并允许重试，避免永久卡加载。
 */

/** 操作类 accepted 统一提示：操作已被服务端受理，处理结果稍后可见 */
export function toastAcceptedAction(message = '操作已受理，正在后台处理，请稍后刷新查看结果'): void {
  toast.info(message)
}

/** 加载类 accepted 统一文案（页面用于 error 态展示 + 重试） */
export const ACCEPTED_LOAD_MESSAGE = '数据正在生成中，请稍后重试'

/**
 * 导出状态管理
 * 
 * 用于在 navbar 和 report-detail 页面之间传递导出命令
 */

import { atom } from 'nanostores'

// 导出格式
export type ExportFormat = 'pdf' | 'png' | null

// 导出命令状态
export const $exportCommand = atom<ExportFormat>(null)

// 导出中状态
export const $isExporting = atom(false)

// 触发导出
export function triggerExport(format: ExportFormat) {
  $exportCommand.set(format)
}

// 清除导出命令
export function clearExportCommand() {
  $exportCommand.set(null)
}

// 设置导出状态
export function setExporting(value: boolean) {
  $isExporting.set(value)
}


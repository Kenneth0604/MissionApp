/** 任務優先程度(數字越大越急)。cls = 淡色底(未選 / 標籤),solid = 整格實色(表單選中) */
export const PRIORITIES = [
  { value: 5, label: '緊急', cls: 'bg-urgent-soft text-urgent ring-urgent/40', solid: 'bg-urgent text-white ring-urgent shadow-md shadow-urgent/40', dot: 'bg-urgent' },
  { value: 4, label: '有點急', cls: 'bg-warning-soft text-warning ring-warning/30', solid: 'bg-warning text-white ring-warning', dot: 'bg-warning' },
  { value: 3, label: '普通', cls: 'bg-info-soft text-info ring-info/30', solid: 'bg-info text-white ring-info', dot: 'bg-info' },
  { value: 2, label: '有空就做', cls: 'bg-success-soft text-success ring-success/30', solid: 'bg-success text-white ring-success', dot: 'bg-success' },
  { value: 1, label: '完全隨便', cls: 'bg-surface-2 text-muted ring-line', solid: 'bg-muted text-white ring-muted', dot: 'bg-muted' },
]
export const DEFAULT_PRIORITY = 3
export const priorityOf = (value) => PRIORITIES.find((p) => p.value === Number(value)) ?? PRIORITIES[2]

/** 任務優先程度(數字越大越急) */
export const PRIORITIES = [
  { value: 5, label: '緊急', cls: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  { value: 4, label: '有點急', cls: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  { value: 3, label: '普通', cls: 'bg-info-soft text-info', dot: 'bg-info' },
  { value: 2, label: '有空就做', cls: 'bg-surface-2 text-muted', dot: 'bg-muted' },
  { value: 1, label: '完全隨便', cls: 'bg-surface-2 text-muted/70', dot: 'bg-muted/50' },
]
export const DEFAULT_PRIORITY = 3
export const priorityOf = (value) => PRIORITIES.find((p) => p.value === Number(value)) ?? PRIORITIES[2]

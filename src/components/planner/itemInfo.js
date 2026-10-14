import { shadeOf, subsOfGroup } from '../../lib/planner.js'

/** 取得某個小塊的顯示資訊:顏色(主類別色系 + 次類別深淺)、麵包屑 */
export function itemInfo(state, item) {
  const group = state.groups.find((g) => g.id === item.groupId)
  const color = group?.color ?? '#999'
  const subIndex = group ? Math.max(0, subsOfGroup(state, group.id).indexOf(item.sub)) : 0
  return {
    group,
    color,
    shade: shadeOf(color, subIndex),
    crumb: [group?.name, item.sub].filter(Boolean).join(' › '),
  }
}

export const BREAK_COLOR = 'var(--t-muted)'

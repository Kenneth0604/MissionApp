// 主類別 / 次類別的共用小工具
export const mainsOf = (categories, kind) => categories.filter((c) => c.kind === kind && !c.parent_id)
export const subsOf = (categories, parentId) => categories.filter((c) => c.parent_id === parentId)

/** 顯示文字:「主類別 › 次類別」或只有主類別 */
export const labelOf = (cat) => (cat ? (cat.parent ? `${cat.parent.name} › ${cat.name}` : cat.name) : '')

/**
 * 篩選是否命中:filter 為 '' 全部、'none' 未分類、主類別 id(含其所有次類別)、或次類別 id
 */
export function matchesFilter(item, filter, categoriesById) {
  if (!filter) return true
  if (filter === 'none') return !item.category_id
  if (item.category_id === filter) return true
  const c = categoriesById[item.category_id]
  return Boolean(c && c.parent_id === filter)
}

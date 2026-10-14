import { useRef, useState } from 'react'
import { DEFAULT_FLAG_TIME, orderedItems, scheduledIds, subsOfGroup, tint } from '../../lib/planner.js'
import { useDrag } from '../../lib/dnd.jsx'
import { itemInfo } from './itemInfo.js'

const BREAKS = [5, 10, 15]

/** 任務池:先建立主類別,再從類別點 ＋ 新增任務 */
export default function TaskPool({ state, dispatch, onOpenItem, onOpenGroup, onAppend }) {
  const { drag, bind } = useDrag()
  const [open, setOpen] = useState(true)
  const [flash, setFlash] = useState('')
  const [insertOpen, setInsertOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [addingItem, setAddingItem] = useState(null) // groupId
  const [itemTitle, setItemTitle] = useState('')
  const [itemMinutes, setItemMinutes] = useState('')
  const groupInputRef = useRef(null)
  const itemInputRef = useRef(null)
  const scheduled = scheduledIds(state)
  const left = state.items.filter((it) => !scheduled.has(it.id)).length
  const returning = drag?.payload.type === 'entry' && drag.zone === 'pool'

  const toggleExpanded = (id) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const done = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 1800)
  }

  const submitGroup = (e) => {
    e.preventDefault()
    const name = groupName.trim()
    if (!name) return
    dispatch({ type: 'addGroup', name })
    done(`已新增主類別「${name}」`)
    setGroupName('')
    setAddingGroup(false)
  }

  const startAddItem = (gid) => {
    setAddingItem(gid)
    setItemTitle('')
    setItemMinutes('')
    setTimeout(() => itemInputRef.current?.focus(), 0)
  }

  const submitItem = (e, gid) => {
    e.preventDefault()
    const title = itemTitle.trim()
    if (!title) return
    dispatch({ type: 'addItem', groupId: gid, title, minutes: itemMinutes || null })
    done(`已新增「${title}」`)
    setAddingItem(null)
    setItemTitle('')
    setItemMinutes('')
  }

  return (
    <section
      data-dropzone="pool"
      className={`card relative flex min-h-0 shrink-0 flex-col sm:max-h-none sm:w-[44%] sm:shrink ${open ? 'max-h-[50%]' : ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 pb-2 pt-3 text-left sm:pointer-events-none"
      >
        <h2 className="text-[15px] font-bold text-ink">任務池</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{left} 個未排</span>
        <span className="ml-auto text-xs text-muted sm:hidden">{open ? '收合 ▾' : '展開 ▴'}</span>
      </button>

      <div className={`min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 ${open ? 'flex' : 'hidden sm:flex'}`}>
        {flash && <p className="px-1 text-[11px] font-semibold text-success">✓ {flash}</p>}

        {/* 新增主類別 */}
        {addingGroup ? (
          <form onSubmit={submitGroup} className="flex gap-2">
            <input
              ref={groupInputRef}
              className="input flex-1 !py-2 !text-sm"
              placeholder="主類別名稱"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
            <button className="btn-primary shrink-0 !px-3 !py-2 text-sm" disabled={!groupName.trim()}>新增</button>
            <button type="button" className="btn-secondary shrink-0 !px-3 !py-2 text-sm" onClick={() => setAddingGroup(false)}>取消</button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => { setAddingGroup(true); setTimeout(() => groupInputRef.current?.focus(), 0) }}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary"
          >
            ＋ 新增主類別
          </button>
        )}

        {/* 插入休息／時間點 */}
        <button
          type="button"
          onClick={() => setInsertOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted"
        >
          <span className="text-base leading-none">{insertOpen ? '▾' : '▸'}</span>
          ＋ 插入休息／時間點
        </button>
        {insertOpen && (
          <div className="flex flex-wrap items-center gap-1.5">
            {BREAKS.map((m) => (
              <Chip
                key={m}
                bindProps={bind({ type: 'break', minutes: m })}
                color="var(--t-muted)"
                label={`☕ ${m}分`}
                onAdd={() => onAppend({ type: 'break', minutes: m })}
              />
            ))}
            <Chip
              bindProps={bind({ type: 'flag', time: DEFAULT_FLAG_TIME })}
              color="var(--t-primary)"
              label="🚩 時間"
              onAdd={() => onAppend({ type: 'flag', time: DEFAULT_FLAG_TIME })}
            />
          </div>
        )}

        {state.groups.length === 0 && <p className="empty py-6">先新增一個主類別吧</p>}

        {state.groups.map((g) => {
          const all = orderedItems(state, g.id)
          const subs = subsOfGroup(state, g.id)
          const rest = all.filter((it) => !scheduled.has(it.id))
          const isExpanded = expanded.has(g.id)
          return (
            <div key={g.id} className="rounded-2xl p-3" style={{ background: tint(g.color, 9) }}>
              <button
                onClick={() => toggleExpanded(g.id)}
                className="mb-1 flex w-full items-center gap-2 text-left"
              >
                <button onClick={(e) => { e.stopPropagation(); onOpenGroup(g.id) }} className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: g.color }} aria-label="編輯類別" />
                <span className="truncate text-[15px] font-bold" style={{ color: g.color }}>{g.name}</span>
                <span className="text-xs text-muted">{rest.length}/{all.length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); startAddItem(g.id) }}
                  className="ml-auto shrink-0 text-xs font-semibold text-primary"
                >
                  ＋ 新增
                </button>
                <span className="ml-1 text-xs text-muted">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {/* 新增任務表單 */}
              {addingItem === g.id && (
                <form onSubmit={(e) => submitItem(e, g.id)} className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-2 p-2">
                  <input
                    ref={itemInputRef}
                    className="input min-w-0 flex-1 !py-1.5 !text-sm"
                    placeholder="任務名稱"
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 30].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setItemMinutes(itemMinutes === m ? '' : m)}
                        className={`chip !py-0.5 text-[11px] ${Number(itemMinutes) === m ? 'chip-active' : ''}`}
                      >
                        {m}分
                      </button>
                    ))}
                  </div>
                  <button className="btn-primary !px-2.5 !py-1 text-xs" disabled={!itemTitle.trim()}>新增</button>
                  <button type="button" className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setAddingItem(null)}>取消</button>
                </form>
              )}

              {isExpanded && (
                rest.length === 0 ? (
                  <p className="text-xs text-muted">{all.length ? '全部排進去了 ✓' : '還沒有任務'}</p>
                ) : (
                  <div className="space-y-2">
                    {subs.map((sub) => {
                      const its = rest.filter((it) => it.sub === sub)
                      if (!its.length) return null
                      const info = itemInfo(state, its[0])
                      return (
                        <div key={sub || '__none'}>
                          {sub && (
                            <button onClick={() => startAddItem(g.id)} className="mb-1 text-[11px] font-semibold" style={{ color: info.shade }}>
                              › {sub}
                            </button>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {its.map((it) => (
                              <Chip
                                key={it.id}
                                bindProps={bind({ type: 'item', itemId: it.id })}
                                color={info.shade}
                                label={it.title}
                                minutes={it.minutes}
                                onOpen={() => onOpenItem(it.id)}
                                onAdd={() => onAppend({ type: 'item', itemId: it.id })}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>

      {returning && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft/90 text-sm font-semibold text-primary">
          放開 → 移回任務池
        </div>
      )}
    </section>
  )
}

function Chip({ bindProps, color, label, minutes, onOpen, onAdd }) {
  return (
    <div
      {...bindProps}
      onClick={onOpen}
      className="flex cursor-grab items-center gap-1 rounded-xl py-1 pl-2.5 pr-1 text-sm font-medium text-ink transition active:scale-[0.97]"
      style={{ background: tint(color, 20), borderLeft: `4px solid ${color}` }}
    >
      <span>{label}</span>
      {minutes != null && <span className="text-[10px] tabular-nums text-muted">{minutes}分</span>}
      <button
        data-nodrag
        onClick={(e) => {
          e.stopPropagation()
          onAdd()
        }}
        aria-label="加到排程最後"
        className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-muted active:bg-surface-2"
      >
        ＋
      </button>
    </div>
  )
}
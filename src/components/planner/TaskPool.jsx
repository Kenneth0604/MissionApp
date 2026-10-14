import { useRef, useState } from 'react'
import { DEFAULT_FLAG_TIME, orderedItems, parseQuickAdd, parseTimeFlag, scheduledIds, subsOfGroup, tint } from '../../lib/planner.js'
import { useDrag } from '../../lib/dnd.jsx'
import { itemInfo } from './itemInfo.js'

const BREAKS = [5, 10, 15]

/** 任務池:輸入任務、依三層類別分組顯示,拖到排程表或按 ＋ 加到最後 */
export default function TaskPool({ state, dispatch, onOpenItem, onOpenGroup, onAppend }) {
  const { drag, bind } = useDrag()
  const [open, setOpen] = useState(true)
  const [text, setText] = useState('')
  const [flash, setFlash] = useState('')
  const inputRef = useRef(null)
  const scheduled = scheduledIds(state)
  const left = state.items.filter((it) => !scheduled.has(it.id)).length
  const flagTime = parseTimeFlag(text)
  const preview = flagTime ? [] : parseQuickAdd(text)
  const returning = drag?.payload.type === 'entry' && drag.zone === 'pool'

  const done = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 1800)
  }

  const submit = (e) => {
    e.preventDefault()
    if (flagTime) {
      onAppend({ type: 'flag', time: flagTime }, { open: false })
      done(`已在排程最後插入 🚩 ${flagTime}`)
      setText('')
      inputRef.current?.focus()
      return
    }
    if (!preview.length) return
    dispatch({ type: 'quickAdd', parsed: preview })
    done(`已新增 ${preview.length} 個小塊`)
    // 保留類別前綴,方便連續輸入同一類
    const prefix = text.includes('/') ? text.slice(0, text.lastIndexOf('/') + 1) : ''
    setText(prefix)
    inputRef.current?.focus()
  }

  const prefill = (value) => {
    setOpen(true)
    setText(value)
    setTimeout(() => inputRef.current?.focus(), 0)
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

      <div data-scroll className={`min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 ${open ? 'flex' : 'hidden sm:flex'}`}>
        <form onSubmit={submit} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input !py-2.5 !text-[15px]"
              placeholder="作業/數學/第1-5題 15分"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn-primary shrink-0 !px-4 !py-2" disabled={!preview.length && !flagTime}>
              {flagTime ? '插入' : '加入'}
            </button>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted">
            {flash ? (
              <span className="font-semibold text-success">✓ {flash}</span>
            ) : flagTime ? (
              <>將在排程最後插入時間點 <b>🚩 {flagTime}</b>,後面的任務從這個時間開始算</>
            ) : preview.length > 1 ? (
              <>將新增 {preview.length} 個:{preview.slice(0, 4).map((p) => p.title).join('、')}{preview.length > 4 && '…'}</>
            ) : (
              <>
                格式:主類別 / 次類別 / 任務,用 <b>1-5</b> 或 <b>一~五</b> 一次切多塊,結尾 <b>15分</b> 設時間(可不填);
                只輸入 <b>12:00</b> 就插入時間點
              </>
            )}
          </p>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted">休息</span>
          {BREAKS.map((m) => (
            <Chip
              key={m}
              bindProps={bind({ type: 'break', minutes: m })}
              color="var(--t-muted)"
              label={`☕ ${m}分`}
              onAdd={() => onAppend({ type: 'break', minutes: m })}
            />
          ))}
          <span className="ml-1 text-[11px] font-semibold text-muted">時間點</span>
          <Chip
            bindProps={bind({ type: 'flag', time: DEFAULT_FLAG_TIME })}
            color="var(--t-primary)"
            label="🚩 時間"
            onAdd={() => onAppend({ type: 'flag', time: DEFAULT_FLAG_TIME })}
          />
        </div>

        {state.groups.length === 0 && <p className="empty py-6">先在上面輸入一些任務吧</p>}

        {state.groups.map((g) => {
          const all = orderedItems(state, g.id)
          const subs = subsOfGroup(state, g.id)
          const rest = all.filter((it) => !scheduled.has(it.id))
          return (
            <div key={g.id} className="rounded-2xl p-3" style={{ background: tint(g.color, 9) }}>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => onOpenGroup(g.id)} className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: g.color }} aria-label="編輯類別" />
                <button onClick={() => onOpenGroup(g.id)} className="truncate text-[15px] font-bold" style={{ color: g.color }}>{g.name}</button>
                <span className="text-xs text-muted">{rest.length}/{all.length}</span>
                <button onClick={() => prefill(`${g.name}/`)} className="ml-auto shrink-0 text-xs font-semibold text-primary">＋ 新增</button>
              </div>

              {rest.length === 0 ? (
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
                          <button onClick={() => prefill(`${g.name}/${sub}/`)} className="mb-1 text-[11px] font-semibold" style={{ color: info.shade }}>
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

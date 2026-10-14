import { useEffect, useRef, useState } from 'react'
import { buildTimeline, fmtTime, locateNow, paceOf, tint } from '../../lib/planner.js'
import { useDrag } from '../../lib/dnd.jsx'
import { useSwipeRight } from '../../lib/swipe.js'
import { BREAK_COLOR, itemInfo } from './itemInfo.js'

/** 現在是當天第幾分鐘(含小數),每 20 秒更新 */
function useNow() {
  const read = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 20000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** 排程表:可拖曳排序,放到任務池就移出排程 */
export default function ScheduleList({ state, dispatch, onOpenItem, onOpenBreak, onOpenFlag, onInterleave }) {
  const { drag, bind } = useDrag()
  const timed = Boolean(state.timed)
  const now = useNow()
  const scrollRef = useRef(null)
  const rows = buildTimeline(state)
  const loc = locateNow(rows, now, timed)
  const pace = timed ? paceOf(rows, loc) : null
  const work = rows.filter((r) => r.entry.kind !== 'flag')
  const draggingId = drag?.payload.type === 'entry' ? drag.payload.entryId : null
  const showPlaceholder = drag && drag.zone === 'schedule'
  const currentId = work.find((r) => !r.entry.done)?.entry.id

  const total = work.reduce((s, r) => s + (r.minutes ?? 0), 0)
  const untimed = work.filter((r) => r.minutes == null).length
  const doneCount = work.filter((r) => r.entry.done).length
  const last = rows[rows.length - 1]
  const endAt = last ? last.start + (last.minutes ?? 0) : null

  const nodes = []
  let visible = 0
  const placeholder = <Placeholder key="__ph" timed={timed} />
  const nowLine = <NowLine key="__now" now={now} timed={timed} />
  rows.forEach((row, i) => {
    const hidden = row.entry.id === draggingId
    if (loc?.before === i) nodes.push(nowLine)
    if (!hidden && showPlaceholder && drag.index === visible) nodes.push(placeholder)
    const bindProps = bind({ type: 'entry', entryId: row.entry.id })
    nodes.push(
      row.entry.kind === 'flag' ? (
        <FlagRow key={row.entry.id} row={row} timed={timed} hidden={hidden} bindProps={bindProps} onOpen={() => onOpenFlag(row.entry.id)} />
      ) : (
        <EntryRow
          key={row.entry.id}
          row={row}
          state={state}
          timed={timed}
          hidden={hidden}
          current={row.entry.id === currentId}
          dragging={Boolean(drag)}
          nowFrac={loc?.inside === row.entry.id ? loc.frac : null}
          now={now}
          bindProps={bindProps}
          onToggle={() => dispatch({ type: 'toggleDone', id: row.entry.id })}
          onRemove={() => dispatch({ type: 'remove', id: row.entry.id })}
          onOpen={() => (row.item ? onOpenItem(row.item.id) : onOpenBreak(row.entry.id))}
        />
      ),
    )
    if (!hidden) visible++
  })
  if (showPlaceholder && drag.index >= visible) nodes.push(placeholder)
  if (loc?.before === rows.length) nodes.push(nowLine)

  // 打開時間軸 / 第一次進來時,把「現在」捲到畫面中間
  const hasNow = Boolean(loc)
  useEffect(() => {
    if (!hasNow) return
    scrollRef.current?.querySelector('[data-now]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [timed, hasNow])

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="card space-y-3 p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-ink">今天的排程</h2>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            {timed && (
              <>
                開始
                <div className="w-[7.5rem]">
                  <input
                    type="time"
                    className="input !min-h-0 !px-2 !py-1 !text-sm"
                    value={state.startTime}
                    onChange={(e) => dispatch({ type: 'setStart', value: e.target.value })}
                  />
                </div>
              </>
            )}
            <button
              className={`chip py-1 text-xs ${timed ? 'chip-active' : ''}`}
              onClick={() => dispatch({ type: 'setTimed', value: !timed })}
              aria-pressed={timed}
              title="開啟後依每塊的分鐘數排出時間軸"
            >
              🕒 時間軸
            </button>
          </div>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: work.length ? `${(doneCount / work.length) * 100}%` : 0 }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            <span className="font-semibold text-danger">● 現在 {fmtTime(Math.floor(now))}</span>
            {' '}· 完成 {doneCount}/{work.length}
            {timed && (
              <>
                {' '}· 共 {total} 分{untimed > 0 && `(${untimed} 個沒填時間)`}
                {endAt != null && ` · 預計 ${fmtTime(endAt)} 結束`}
              </>
            )}
            {pace != null && pace !== 0 && work.length > 0 && (
              <span className={`font-semibold ${pace > 0 ? 'text-danger' : 'text-success'}`}>
                {' '}· {pace > 0 ? `落後 ${pace} 塊` : `超前 ${-pace} 塊`}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="chip py-1 text-xs" onClick={onInterleave}>🔀 自動穿插</button>
          <button className="chip py-1 text-xs" onClick={() => dispatch({ type: 'resetDone' })} disabled={!doneCount}>↺ 取消勾選</button>
          <button
            className="chip py-1 text-xs"
            onClick={() => rows.length && confirm('把排程全部移回任務池?') && dispatch({ type: 'clearSchedule' })}
          >
            清空
          </button>
          <button
            className="chip ml-auto py-1 text-xs text-muted"
            onClick={() => confirm('載入範例資料?目前的資料會被清掉') && dispatch({ type: 'reset' })}
          >
            載入範例
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-dropzone="schedule"
        data-scroll
        className={`min-h-[8rem] flex-1 overflow-y-auto overflow-x-hidden rounded-2xl p-1 transition-colors ${drag && drag.zone === 'schedule' ? 'bg-primary-soft' : ''}`}
      >
        {rows.length === 0 && !drag ? (
          <div className="empty flex h-full flex-col items-center justify-center gap-1 border-2 border-dashed border-line">
            <span className="text-3xl">🧩</span>
            <span>把任務池裡的小塊拖到這裡</span>
            <span className="text-xs">或按「🔀 自動穿插」一次排好</span>
          </div>
        ) : (
          <div className="space-y-1.5 pb-16">{nodes}</div>
        )}
      </div>
    </section>
  )
}

function Placeholder({ timed }) {
  return (
    <div className="flex gap-2">
      {timed && <div className="w-11 shrink-0" />}
      <div className="h-12 flex-1 rounded-2xl border-2 border-dashed border-primary bg-primary-soft" />
    </div>
  )
}

/** 現在時間線(落在兩個區塊之間時) */
function NowLine({ now, timed }) {
  return (
    <div data-now className="flex items-center gap-2" aria-label="現在時間">
      {timed && (
        <div className="w-11 shrink-0 text-right text-[11px] font-bold tabular-nums text-danger">{fmtTime(Math.floor(now))}</div>
      )}
      <div className="flex flex-1 items-center">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
        <span className="h-0.5 flex-1 bg-danger" />
        {!timed && <span className="ml-2 shrink-0 text-[11px] font-bold tabular-nums text-danger">現在 {fmtTime(Math.floor(now))}</span>}
      </div>
    </div>
  )
}

/** 時間點旗標:把後面的時間對齊到指定時間;時間軸開啟時顯示空檔 / 超時 */
function FlagRow({ row, timed, hidden, bindProps, onOpen }) {
  const { entry, diff } = row
  const showDiff = timed && diff != null && diff !== 0
  return (
    <div data-slot={hidden ? undefined : ''} style={hidden ? { display: 'none' } : undefined} className="flex items-center gap-2 py-0.5">
      {timed && <div className="w-11 shrink-0" />}
      <div {...bindProps} onClick={onOpen} className="flex flex-1 cursor-grab items-center gap-2 select-none">
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-bold tabular-nums text-primary-fg">
          🚩 {entry.time}
        </span>
        <span className="h-0.5 flex-1 rounded-full bg-primary/40" />
        {showDiff && (
          <span className={`shrink-0 text-[11px] font-semibold ${diff < 0 ? 'text-danger' : 'text-muted'}`}>
            {diff < 0 ? `⚠ 超過 ${-diff} 分` : `空檔 ${diff} 分`}
          </span>
        )}
        <span data-handle className="shrink-0 cursor-grab px-1 text-lg leading-none text-muted" style={{ touchAction: 'none' }}>⠿</span>
      </div>
    </div>
  )
}

function EntryRow({ row, state, timed, hidden, current, dragging, nowFrac, now, bindProps, onToggle, onRemove, onOpen }) {
  const { entry, item, minutes, start } = row
  const isBreak = entry.kind === 'break'
  const info = item ? itemInfo(state, item) : null
  const color = isBreak ? BREAK_COLOR : info.shade
  const swipe = useSwipeRight(onToggle, { disabled: dragging })
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn()
  }
  const pointerDown = (e) => {
    swipe.onPointerDown(e)
    bindProps.onPointerDown?.(e)
  }

  return (
    <div
      data-slot={hidden ? undefined : ''}
      data-now={nowFrac != null ? '' : undefined}
      style={hidden ? { display: 'none' } : undefined}
      className="relative flex items-stretch gap-2"
    >
      {timed && (
        <div className={`w-11 shrink-0 pt-3.5 text-right text-[11px] font-semibold tabular-nums ${current ? 'text-primary' : 'text-muted'}`}>
          {fmtTime(start)}
        </div>
      )}
      <div className="relative flex-1">
        {/* 右滑時露出來的底色 */}
        {swipe.dx > 0 && (
          <div
            className={`absolute inset-0 flex items-center rounded-2xl pl-4 text-sm font-bold text-white transition-colors ${swipe.armed ? (entry.done ? 'bg-muted' : 'bg-success') : 'bg-surface-2 !text-muted'}`}
          >
            {entry.done ? '↺ 還原' : '✓ 完成'}
          </div>
        )}
        <div
          {...bindProps}
          onPointerDown={pointerDown}
          onClick={onOpen}
          className={`card relative flex cursor-grab items-center gap-2.5 py-2.5 pl-4 pr-1.5 ${swipe.dx ? '' : 'transition active:scale-[0.99]'} ${current ? 'ring-2 ring-primary' : ''} ${entry.done ? 'opacity-50' : ''}`}
          style={{
            background: isBreak ? 'var(--t-surface)' : tint(info.shade, 14),
            touchAction: 'pan-y',
            transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined,
            transition: swipe.settling ? 'transform 160ms ease-out' : undefined,
          }}
        >
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
          <button
            data-nodrag
            onClick={stop(onToggle)}
            aria-label="完成"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold text-white"
            style={{ borderColor: color, background: entry.done ? color : 'transparent' }}
          >
            {entry.done && '✓'}
          </button>
          <div className="min-w-0 flex-1">
            {info?.crumb && <div className="truncate text-[11px] font-medium" style={{ color }}>{info.crumb}</div>}
            <div className={`truncate font-semibold text-ink ${entry.done ? 'line-through' : ''}`}>
              {isBreak ? '☕ 休息' : item.title}
            </div>
          </div>
          {current && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-fg">進行中</span>}
          {minutes != null && <span className="shrink-0 text-xs tabular-nums text-muted">{minutes}分</span>}
          <button data-nodrag onClick={stop(onRemove)} aria-label="移出排程" className="shrink-0 px-1.5 text-muted">✕</button>
          <span data-handle className="shrink-0 cursor-grab select-none px-1 text-lg leading-none text-muted" style={{ touchAction: 'none' }}>⠿</span>
        </div>
      </div>

      {/* 現在時間落在這一塊裡:依經過比例畫一條紅線 */}
      {nowFrac != null && (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-2" style={{ top: `${nowFrac * 100}%`, transform: 'translateY(-50%)' }}>
          {timed && (
            <div className="w-11 shrink-0 text-right">
              <span className="rounded bg-danger px-1 text-[10px] font-bold tabular-nums text-white">{fmtTime(Math.floor(now))}</span>
            </div>
          )}
          <span className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
          <span className="-ml-2 h-0.5 flex-1 bg-danger" />
        </div>
      )}
    </div>
  )
}

/** 拖曳中的浮動卡片 */
export function GhostCard({ title, crumb, color, minutes, hint }) {
  return (
    <div className="card relative flex items-center gap-2.5 py-2.5 pl-4 pr-3 shadow-2xl ring-2 ring-primary" style={{ background: tint(color, 22) }}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        {crumb && <div className="truncate text-[11px] font-medium" style={{ color }}>{crumb}</div>}
        <div className="truncate font-semibold text-ink">{title}</div>
      </div>
      {hint ? (
        <span className="shrink-0 text-xs font-semibold text-primary">{hint}</span>
      ) : (
        minutes != null && <span className="shrink-0 text-xs text-muted">{minutes}分</span>
      )}
    </div>
  )
}

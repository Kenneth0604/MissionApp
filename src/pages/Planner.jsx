import { useState } from 'react'
import { newEntry } from '../lib/planner.js'
import { usePlanner } from '../lib/usePlanner.js'
import { DragProvider } from '../lib/dnd.jsx'
import ScheduleList, { GhostCard } from '../components/planner/ScheduleList.jsx'
import TaskPool from '../components/planner/TaskPool.jsx'
import { BreakSheet, FlagSheet, GroupSheet, InterleaveSheet, ItemSheet } from '../components/planner/Sheets.jsx'
import { BREAK_COLOR, itemInfo } from '../components/planner/itemInfo.js'

/**
 * 任務切塊排程:先把任務切成小塊丟進任務池,再拖到排程表決定順序
 * 手機:上排程、下任務池;寬螢幕:左右兩欄
 */
export default function Planner() {
  const [state, dispatch] = usePlanner()
  const [sheet, setSheet] = useState(null)
  const close = () => setSheet(null)

  const toEntry = (payload) => {
    if (payload.type === 'item') return newEntry('task', { itemId: payload.itemId })
    if (payload.type === 'flag') return newEntry('flag', { time: payload.time })
    return newEntry('break', { minutes: payload.minutes })
  }

  // 插入時間點後直接打開編輯,方便改成想要的時間(快速輸入已經指定時間就不用)
  const insert = (payload, index, { open = true } = {}) => {
    const entry = toEntry(payload)
    dispatch({ type: 'insert', index, entry })
    if (payload.type === 'flag' && open) setSheet({ type: 'flag', id: entry.id })
  }

  const append = (payload, opts) => insert(payload, null, opts)

  const handleDrop = ({ payload, zone, index }) => {
    if (zone === 'schedule') {
      if (payload.type === 'entry') dispatch({ type: 'move', id: payload.entryId, index })
      else insert(payload, index)
    } else if (zone === 'pool' && payload.type === 'entry') {
      dispatch({ type: 'remove', id: payload.entryId })
    }
  }

  const renderGhost = (payload, zone) => {
    const hint = payload.type === 'entry' && zone === 'pool' ? '移回' : null
    let item = null
    let minutes
    let flag = payload.type === 'flag' ? payload.time : null
    if (payload.type === 'item') item = state.items.find((i) => i.id === payload.itemId)
    if (payload.type === 'entry') {
      const e = state.schedule.find((x) => x.id === payload.entryId)
      if (e?.kind === 'task') item = state.items.find((i) => i.id === e.itemId)
      else if (e?.kind === 'flag') flag = e.time
      else minutes = e?.minutes
    }
    if (payload.type === 'break') minutes = payload.minutes
    if (flag) return <GhostCard title={`🚩 ${flag}`} crumb="時間點" color="var(--t-primary)" hint={hint} />
    if (!item) return <GhostCard title="☕ 休息" color={BREAK_COLOR} minutes={minutes} hint={hint} />
    const info = itemInfo(state, item)
    return <GhostCard title={item.title} crumb={info.crumb} color={info.shade} minutes={item.minutes} hint={hint} />
  }

  return (
    <DragProvider onDrop={handleDrop} renderGhost={renderGhost}>
      <div className="flex h-full min-h-0 flex-col gap-3 sm:flex-row">
        <ScheduleList
          state={state}
          dispatch={dispatch}
          onOpenItem={(id) => setSheet({ type: 'item', id })}
          onOpenBreak={(id) => setSheet({ type: 'break', id })}
          onOpenFlag={(id) => setSheet({ type: 'flag', id })}
          onInterleave={() => setSheet({ type: 'interleave' })}
        />
        <TaskPool
          state={state}
          dispatch={dispatch}
          onOpenItem={(id) => setSheet({ type: 'item', id })}
          onOpenGroup={(id) => setSheet({ type: 'group', id })}
          onAppend={append}
        />
      </div>

      {sheet?.type === 'item' && <ItemSheet key={sheet.id} state={state} dispatch={dispatch} id={sheet.id} onClose={close} onAppend={append} />}
      {sheet?.type === 'group' && <GroupSheet key={sheet.id} state={state} dispatch={dispatch} id={sheet.id} onClose={close} />}
      {sheet?.type === 'break' && <BreakSheet key={sheet.id} state={state} dispatch={dispatch} id={sheet.id} onClose={close} />}
      {sheet?.type === 'flag' && <FlagSheet key={sheet.id} state={state} dispatch={dispatch} id={sheet.id} onClose={close} />}
      {sheet?.type === 'interleave' && <InterleaveSheet state={state} dispatch={dispatch} onClose={close} />}
    </DragProvider>
  )
}

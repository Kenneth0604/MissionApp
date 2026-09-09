import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'

/** 建立任務表單頂端的快捷任務選擇列;選一個直接套用內容 */
export default function PresetPicker({ onPick }) {
  const { presets } = useStore()

  if (presets.length === 0) {
    return (
      <p className="text-xs text-muted">
        還沒有快捷任務,可以到<Link to="/settings" className="text-primary underline">設定</Link>先建立幾個常用範本,下次就能直接套用。
      </p>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">⚡ 快捷任務(點一下直接套用)</p>
      <div className="no-scrollbar -mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 py-1">
        {presets.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="chip shrink-0 py-1.5 text-sm">
            ⚡ {p.title}
          </button>
        ))}
      </div>
    </div>
  )
}

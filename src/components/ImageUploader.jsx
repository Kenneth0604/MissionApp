import { useRef, useState } from 'react'
import { uploadImage } from '../lib/images.js'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'

/** 圖片上傳:選檔 → 壓縮 → 上傳 Storage → 回傳網址清單 */
export default function ImageUploader({ value = [], onChange, folder = 'tasks', max = 6 }) {
  const { userId } = useStore()
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(0)

  async function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const room = max - value.length
    if (room <= 0) return toast.error(`最多 ${max} 張圖片`)
    const picked = files.slice(0, room)
    setBusy(picked.length)
    const urls = []
    for (const f of picked) {
      try {
        urls.push(await uploadImage(f, userId, folder))
      } catch (err) {
        toast.error(err.message || '上傳失敗')
      } finally {
        setBusy((n) => n - 1)
      }
    }
    if (urls.length) onChange([...value, ...urls])
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {value.map((url) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-line">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              aria-label="移除圖片"
            >
              ✕
            </button>
          </div>
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div key={`busy-${i}`} className="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-surface-2 text-xs text-muted">
            上傳中…
          </div>
        ))}
        {value.length + busy < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted"
          >
            <span className="text-2xl leading-none">＋</span>
            <span className="text-xs">加圖片</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
      <p className="mt-1.5 text-xs text-muted">最多 {max} 張,會自動縮圖後上傳。</p>
    </div>
  )
}

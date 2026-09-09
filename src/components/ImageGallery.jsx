import { useState } from 'react'

export default function ImageGallery({ urls = [] }) {
  const [open, setOpen] = useState(null)
  if (!urls.length) return null
  return (
    <>
      <div className={`grid gap-2 ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {urls.map((u) => (
          <button key={u} type="button" onClick={() => setOpen(u)} className="overflow-hidden rounded-xl ring-1 ring-line">
            <img src={u} alt="" className={`w-full object-cover ${urls.length === 1 ? 'max-h-72' : 'aspect-square'}`} loading="lazy" />
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <img src={open} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] rounded-full bg-white/20 px-3 py-1 text-sm text-white">關閉</button>
        </div>
      )}
    </>
  )
}

import { useStore } from '../lib/store.jsx'

export default function ComingSoon({ title }) {
  const { resetDemo } = useStore()
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
        <div className="text-4xl">🚧</div>
        <h2 className="mt-3 text-lg font-bold text-slate-800">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">此功能將在下一階段實作(獎勵目錄、申請兌換、確認交付)。</p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <p className="font-medium text-slate-700">Prototype 工具</p>
        <p className="mt-1 text-xs">資料目前存在瀏覽器 localStorage,想重來可以重設示範資料。</p>
        <button
          onClick={() => confirm('重設所有任務與積分資料?') && resetDemo()}
          className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-300"
        >
          重設示範資料
        </button>
      </div>
    </div>
  )
}

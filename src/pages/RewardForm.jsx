import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import ImageUploader from '../components/ImageUploader.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'

export default function RewardForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { rewards, createReward, updateReward } = useStore()
  const editing = id ? rewards.find((r) => r.id === id) : null

  const [form, setForm] = useState(() => ({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    image_urls: editing?.image_urls ?? [],
    category_id: editing?.category_id ?? '',
    cost_points: editing?.cost_points ?? 50,
    unlimited: editing ? editing.stock === -1 : true,
    stock: editing && editing.stock >= 0 ? editing.stock : 1,
    is_active: editing?.is_active ?? true,
  }))
  const [busy, setBusy] = useState(false)

  if (id && !editing) return <p className="text-muted">找不到這個獎勵</p>

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const patch = (obj) => setForm((f) => ({ ...f, ...obj }))

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('請輸入獎勵名稱')
    if (Number(form.cost_points) < 0) return toast.error('所需積分不能是負數')
    setBusy(true)
    try {
      if (editing) await updateReward(editing.id, form)
      else await createReward(form)
      toast.success(editing ? '已儲存' : '獎勵已新增')
      navigate('/rewards', { replace: true })
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h2 className="text-xl font-bold text-ink">{editing ? '編輯獎勵' : '新增獎勵'}</h2>

      <div>
        <span className="label">名稱</span>
        <input value={form.name} onChange={set('name')} placeholder="例如:一杯手搖飲" className="input" autoFocus={!editing} />
      </div>

      <div>
        <span className="label">類別</span>
        <CategoryPicker kind="reward" value={form.category_id} onChange={(v) => patch({ category_id: v })} />
      </div>

      <div>
        <span className="label">說明(選填)</span>
        <textarea value={form.description} onChange={set('description')} rows={2} className="input" />
      </div>

      <div>
        <span className="label">圖片(選填)</span>
        <ImageUploader folder="rewards" max={3} value={form.image_urls} onChange={(urls) => patch({ image_urls: urls })} />
      </div>

      <div>
        <span className="label">所需積分</span>
        <input type="number" min="0" inputMode="numeric" value={form.cost_points} onChange={set('cost_points')} className="input" />
        <p className="mt-1 text-xs text-muted">若獎勵是作為任務獎勵直接指定,則不會扣點。</p>
      </div>

      <div>
        <span className="label">庫存</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => patch({ unlimited: true })} className={`chip flex-1 ${form.unlimited ? 'chip-active' : ''}`}>無限</button>
          <button type="button" onClick={() => patch({ unlimited: false })} className={`chip flex-1 ${!form.unlimited ? 'chip-active' : ''}`}>限量</button>
        </div>
        {!form.unlimited && (
          <input type="number" min="0" inputMode="numeric" value={form.stock} onChange={set('stock')} className="input mt-2" placeholder="份數" />
        )}
      </div>

      {editing && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="accent-primary" />
          在目錄中啟用(取消勾選即停用,不會刪除歷史紀錄)
        </label>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? '儲存中…' : editing ? '儲存' : '新增'}</button>
      </div>
    </form>
  )
}

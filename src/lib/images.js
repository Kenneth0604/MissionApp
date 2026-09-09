import { supabase, IMAGE_BUCKET } from './supabase.js'

const MAX_EDGE = 1280
const QUALITY = 0.82

/** 在瀏覽器端縮圖 + 轉 JPEG,避免手機原圖(數 MB)直接上傳 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('只能上傳圖片檔')
  const bitmap = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('圖片處理失敗')
  return blob
}

function loadImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file).catch(() => loadViaElement(file))
  }
  return loadViaElement(file)
}

function loadViaElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('無法讀取圖片'))
    }
    img.src = url
  })
}

/**
 * 上傳到 Storage 並回傳公開網址
 * @param folder 'tasks' | 'rewards'(對應 Storage 內的資料夾)
 */
export async function uploadImage(file, userId, folder = 'tasks') {
  const blob = await compressImage(file)
  const name = `${folder}/${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(name, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(name)
  return data.publicUrl
}

/** 從公開網址反推 storage 路徑,用於刪除 */
export function storagePathFromUrl(url) {
  const marker = `/object/public/${IMAGE_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

export async function deleteImages(urls) {
  const paths = (urls ?? []).map(storagePathFromUrl).filter(Boolean)
  if (paths.length === 0) return
  await supabase.storage.from(IMAGE_BUCKET).remove(paths)
}

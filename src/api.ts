import type { MBTIDatas, Member } from './data'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
const TOKEN = import.meta.env.VITE_API_TOKEN ?? ''

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${detail || res.statusText}`)
  }
  return res.json() as Promise<T>
}

/** 全16タイプの members マップを取得（キーは MBTI コード） */
export const fetchMembers = () => req<Record<string, Member[]>>('/api/members')

/** メンバーを1人追加し、サーバー採番の id 付きで返す */
export const addMember = (mbti: string, name: string) =>
  req<Member>('/api/members', { method: 'POST', body: JSON.stringify({ mbti, name }) })

/** id を指定して1人削除 */
export const deleteMember = (id: number) =>
  req<{ ok: true }>(`/api/members/${id}`, { method: 'DELETE' })

/**
 * JSON を丸ごと取り込む（全置換）。
 * 新形式（members: {id,name}[]）と旧 localStorage 形式（members: string[]）の両方を受け付ける。
 */
export const importMembers = (payload: MBTIDatas) =>
  req<{ ok: true; imported: number }>('/api/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

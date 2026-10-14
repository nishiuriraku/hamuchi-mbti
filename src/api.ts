import type { Member } from './data'

/**
 * API のベースURL。
 * 本番（Netlify）では未設定＝同一オリジンの Netlify Function（/api/* プロキシ）が
 * 認証トークンを付けて上流 API に中継する。ローカル開発では VITE_API_BASE に
 * API サーバー（例: http://localhost:3001）を指定して直接呼び分ける。
 */
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

/** メンバーを1人追加し、サーバー採番の id 付きで返す（Turnstile トークン付き） */
export const addMember = (mbti: string, name: string, turnstileToken: string | null) =>
  req<Member>('/api/members', {
    method: 'POST',
    body: JSON.stringify({ mbti, name }),
    headers: turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : undefined,
  })

/** id を指定して1人削除（Turnstile トークン付き） */
export const deleteMember = (id: number, turnstileToken: string | null) =>
  req<{ ok: true }>(`/api/members/${id}`, {
    method: 'DELETE',
    headers: turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : undefined,
  })

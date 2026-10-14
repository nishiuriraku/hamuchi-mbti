/**
 * hamuchi-mbti API サーバー（Bun.serve、外部依存ゼロ）
 *
 * 役割: Netlify の静的SPAから呼ばれる共有データAPI。
 * 認証: API_TOKEN を設定していれば Bearer / X-API-Token のどちらかで照合。
 *      未設定なら認証スキップ（ローカル開発用）。
 * CORS: ALLOWED_ORIGIN はカンマ区切りで複数オリジンを許可できる。
 */
import {
  addMember,
  collectMembers,
  deleteMember,
  HttpError,
  openDb,
  replaceAllMembers,
} from './store'

const PORT = Number(process.env.PORT ?? 3001)
const API_TOKEN = process.env.API_TOKEN ?? ''
/** カンマ区切りで複数オリジン許可可能（例: https://x.netlify.app,http://localhost:5173） */
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

const db = openDb()

/** 許容オリジンの場合だけ ACAO を付ける（不一致ならヘッダーなし = ブラウザがブロック） */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Token',
    'Access-Control-Max-Age': '86400',
  }
  if (ALLOWED_ORIGINS.has('*')) {
    headers['Access-Control-Allow-Origin'] = '*'
  } else if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

const json = (data: unknown, status = 200, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

function authorized(req: Request): boolean {
  if (!API_TOKEN) return true
  if (req.headers.get('authorization') === `Bearer ${API_TOKEN}`) return true
  return req.headers.get('x-api-token') === API_TOKEN
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const cors = corsHeaders(req.headers.get('origin'))
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      if (url.pathname === '/api/health') return json({ ok: true }, 200, cors)
      if (!authorized(req)) return json({ error: 'unauthorized' }, 401, cors)

      if (url.pathname === '/api/members' && req.method === 'GET') {
        return json(collectMembers(db), 200, cors)
      }
      if (url.pathname === '/api/members' && req.method === 'POST') {
        let body: { mbti?: unknown; name?: unknown }
        try {
          body = await req.json()
        } catch {
          return json({ error: 'invalid json' }, 400, cors)
        }
        return json(addMember(db, String(body?.mbti), String(body?.name ?? '')), 201, cors)
      }
      const del = url.pathname.match(/^\/api\/members\/(\d+)$/)
      if (del && req.method === 'DELETE') {
        const ok = deleteMember(db, Number(del[1]))
        return ok ? json({ ok: true }, 200, cors) : json({ error: 'not found' }, 404, cors)
      }
      if (url.pathname === '/api/import' && req.method === 'POST') {
        let body: unknown
        try {
          body = await req.json()
        } catch {
          return json({ error: 'invalid json' }, 400, cors)
        }
        return json({ ok: true, imported: replaceAllMembers(db, body) }, 200, cors)
      }
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
      console.error(e)
      return json({ error: 'internal' }, 500, cors)
    }
  },
})

console.log(
  `hamuchi-mbti api listening on :${PORT}` +
    (API_TOKEN ? '' : ' (注意: API_TOKEN 未設定のため認証なし)'),
)

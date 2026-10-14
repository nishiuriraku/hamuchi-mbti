/**
 * hamuchi-mbti API サーバー（Bun.serve、外部依存ゼロ）
 *
 * 役割: Netlify Function プロキシ経由で公開SPAから呼ばれる共有データAPI。
 * 認証: API_TOKEN を設定していれば Bearer / X-API-Token のどちらかで照合（定数時間比較）。
 *      未設定なら認証スキップ（ローカル開発用。NODE_ENV=production では必須）。
 *      /api/import（全置換）は公開経路から外した。全置換は server/seed.ts を使う。
 * CORS: ALLOWED_ORIGIN はカンマ区切りで複数オリジンを許可できる。
 *       既定は空（= どこも許可しない）。ブラウザが直接オリジン跨ぎで呼ぶ場合だけ設定する。
 * レート制限: IP 単位のスライディングウィンドウ。GET と書き込みで閾値を分ける。
 * ボディ上限: 256KB（Bun の maxRequestBodySize とアプリ側の二重ガード）。
 */
import { timingSafeEqual } from 'node:crypto'
import {
  addMember,
  collectMembers,
  deleteMember,
  HttpError,
  MAX_DB_MEMBERS,
  openDb,
} from './store'

const PORT = Number(process.env.PORT ?? 3001)
/**
 * 待ち受けアドレス。cloudflared（トンネル）は同じホストの localhost に向けて繋ぐので、
 * 既定は 127.0.0.1。0.0.0.0 にすると同一 LAN からトンネルをバイパスして直接叩ける。
 */
const HOST = process.env.HOST ?? '127.0.0.1'
const API_TOKEN = process.env.API_TOKEN ?? ''
const NODE_ENV = process.env.NODE_ENV ?? 'development'
if (!API_TOKEN && NODE_ENV === 'production') {
  console.error('API_TOKEN が未設定です。本番では API_TOKEN を設定してください（server/.env）。')
  process.exit(1)
}
/** PROXY_SECRET を設定すると、書き込みは Netlify Function（X-Proxy-Secret 所持）経由のみ許可 */
const PROXY_SECRET = process.env.PROXY_SECRET ?? ''

const MAX_BODY_BYTES = 256 * 1024

/** カンマ区切りで複数オリジン許可可能（例: https://x.netlify.app,http://localhost:5173） */
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

// --- レート制限（プロセス内のスライディングウィンドウ） ---
const RATE_WINDOW_MS = 60_000
const READ_LIMIT = Number(process.env.RATE_LIMIT_READ ?? 120)
const WRITE_LIMIT = Number(process.env.RATE_LIMIT_WRITE ?? 20)

const db = openDb()

/** 許容オリジンの場合だけ ACAO を付ける（不一致ならヘッダーなし = ブラウザがブロック） */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Token',
    'Access-Control-Max-Age': '86400',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const json = (data: unknown, status = 200, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
  })

/** 共有秘密の定数時間比較（長さ不一致はその時点で false） */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function authorized(req: Request): boolean {
  if (!API_TOKEN) return true
  const auth = req.headers.get('authorization')
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth)
    if (m) return secretsMatch(m[1].trim(), API_TOKEN)
  }
  const x = req.headers.get('x-api-token')
  return x ? secretsMatch(x, API_TOKEN) : false
}

/**
 * 接続元 IP の推定。優先順位:
 *  1. X-Client-IP … Netlify Function が context.ip を載せて送る（クライアント送信分は信用しない）
 *  2. CF-Connecting-IP … cloudflared 経由の接続元
 *  3. X-Forwarded-For の先頭
 *  4. 'direct'
 * 注意: このサーバーは 127.0.0.1 listen なので、直接到達できるのは cloudflared だけ。
 */
function clientIp(req: Request): string {
  return (
    req.headers.get('x-client-ip') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'direct'
  )
}

/** スライディングウィンドウ。bucket は Map<ip, ヒット時刻配列> */
const buckets = new Map<string, number[]>()

function rateLimit(key: string, limit: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - hits[0])) / 1000)
    return { ok: false, retryAfter: Math.max(retryAfter, 1) }
  }
  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, retryAfter: 0 }
}

// 古い bucket を掃除（イベントループを拘束しないよう unref）
setInterval(() => {
  const now = Date.now()
  for (const [k, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < RATE_WINDOW_MS)
    if (fresh.length === 0) buckets.delete(k)
    else buckets.set(k, fresh)
  }
}, RATE_WINDOW_MS).unref()

/** 書き込みの監査ログ（journalctl -u で追える。メンバー名などの内容は書かない） */
function audit(ip: string, req: Request, status: number, extra = ''): void {
  const url = new URL(req.url)
  console.log(
    `[audit] ${new Date().toISOString()} ip=${ip} ${req.method} ${url.pathname} status=${status}${extra ? ` ${extra}` : ''}`,
  )
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  // 既定 128MB だと巨大 JSON を載せやすいので明示的に絞る
  maxRequestBodySize: MAX_BODY_BYTES,
  async fetch(req) {
    const url = new URL(req.url)
    const cors = corsHeaders(req.headers.get('origin'))
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    // 宣言サイズでの早期拒否（Bun の上限に落ちると素っ気ないエラーになるため）
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413, cors)

    const ip = clientIp(req)
    const isWrite = req.method === 'POST' || req.method === 'DELETE'

    // PROXY_SECRET 設定時: 書き込みは Netlify Function 経由のみ（トンネル直叩き書き込みを禁止）
    if (isWrite && PROXY_SECRET && !secretsMatch(req.headers.get('x-proxy-secret') ?? '', PROXY_SECRET)) {
      audit(ip, req, 403)
      return json({ error: 'forbidden' }, 403, cors)
    }

    try {
      if (url.pathname === '/api/health') return json({ ok: true }, 200, cors)
      if (!authorized(req)) return json({ error: 'unauthorized' }, 401, cors)

      const rl = rateLimit(
        `${ip}:${isWrite ? 'write' : 'read'}`,
        isWrite ? WRITE_LIMIT : READ_LIMIT,
      )
      if (!rl.ok) {
        return json(
          { error: 'too many requests' },
          429,
          { ...cors, 'Retry-After': String(rl.retryAfter) },
        )
      }

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
        const created = addMember(db, String(body?.mbti), String(body?.name ?? ''))
        audit(ip, req, 201, `id=${created.id}`)
        return json(created, 201, cors)
      }
      const del = url.pathname.match(/^\/api\/members\/(\d+)$/)
      if (del && req.method === 'DELETE') {
        const ok = deleteMember(db, Number(del[1]))
        audit(ip, req, ok ? 200 : 404, `id=${del[1]}`)
        return ok ? json({ ok: true }, 200, cors) : json({ error: 'not found' }, 404, cors)
      }
      // /api/import は公開経路から外した（全置換は server/seed.ts で実行する）
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      if (e instanceof HttpError) {
        if (isWrite) audit(ip, req, e.status, `error=${e.message}`)
        return json({ error: e.message }, e.status, cors)
      }
      console.error(e)
      if (isWrite) audit(ip, req, 500)
      return json({ error: 'internal' }, 500, cors)
    }
  },
})

console.log(
  `hamuchi-mbti api listening on ${HOST}:${PORT}` +
    (API_TOKEN ? '' : ' (注意: API_TOKEN 未設定のため認証なし)') +
    ` (members 上限 ${MAX_DB_MEMBERS}, read ${READ_LIMIT}/min, write ${WRITE_LIMIT}/min per IP)`,
)

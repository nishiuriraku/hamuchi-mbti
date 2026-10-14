/**
 * hamuchi-mbti API プロキシ（Netlify Function）
 *
 * 公開 SPA から /api/* のリクエストを受け、トンネル越しの上流 API に中継する。
 * 認証トークンはこの関数の環境変数（API_TOKEN）にのみ存在させ、
 * フロントのバンドル（VITE_* は誰でも読める）には含めないのが目的。
 *
 * 信頼境界:
 *   - ブラウザ → この関数: 同一オリジン（CORS 不要）。トークンは送られてこない。
 *   - この関数 → 上流 API: Authorization ヘッダを付与。X-Client-IP に
 *     context.ip（Netlify が確定させた接続元 IP。クライアントヘッダは信用しない）を載せる。
 *
 * bot 対策（Cloudflare Turnstile）:
 *   書き込み（POST/DELETE）は X-Turnstile-Token を siteverify で検証してから中継する。
 *   TURNSTILE_SECRET 未設定時はスキップ（ローカル開発）。
 *
 * 必要な環境変数（Netlify ダッシュボードで設定。VITE_ プレフィックスは付けない）:
 *   API_ORIGIN        上流 API のオリジン（例: https://mbti-api.example.com）
 *   API_TOKEN         上流 API の API_TOKEN と同値
 *   PROXY_SECRET      任意。設定すると上流 API の PROXY_SECRET と照合する
 *                     X-Proxy-Secret ヘッダを付け、トンネル直叩きの書き込みを防ぐ。
 *   TURNSTILE_SECRET  任意。設定すると書き込みを Turnstile 検証済みだけに限定する。
 *                     sitekey は VITE_TURNSTILE_SITEKEY としてフロントに渡す（公開値）。
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? '').replace(/\/+$/, '')
const API_TOKEN = process.env.API_TOKEN ?? ''
const PROXY_SECRET = process.env.PROXY_SECRET ?? ''
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET ?? ''

/** SPA が使うメソッドだけ許可（TRACE/PATCH 等は受け付けない） */
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'])

/** 上流の maxRequestBodySize（server/index.ts）と合わせる */
const MAX_BODY_BYTES = 256 * 1024
const UPSTREAM_TIMEOUT_MS = 10_000
const TURNSTILE_TIMEOUT_MS = 5_000
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** 全置換は「公開経路から外す」方針。サーバー側の seed スクリプトのみが実行できる */
const BLOCKED_PATHS = new Set(['/api/import'])

const securityHeaders = () => ({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
})

const jsonError = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...securityHeaders(), 'Content-Type': 'application/json' },
  })

/**
 * Turnstile トークンを検証する。secret 未設定ならスキップ（{}）。
 * 戻り値は { ok: true } または { ok: false, error }。検証インフラの故障は fail closed。
 */
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET) return { ok: true }
  if (!token) return { ok: false, error: 'turnstile token missing' }
  try {
    const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token })
    if (ip) form.set('remoteip', ip)
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `turnstile http ${res.status}` }
    const body = await res.json()
    if (body?.success) return { ok: true }
    return { ok: false, error: `turnstile: ${(body?.['error-codes'] ?? []).join(',') || 'rejected'}` }
  } catch (e) {
    console.error('api proxy: turnstile verify error:', e)
    return { ok: false, error: 'turnstile verify failed' }
  }
}

export default async (req, context) => {
  const url = new URL(req.url)

  if (!ALLOWED_METHODS.has(req.method)) {
    return jsonError('method not allowed', 405)
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET,POST,DELETE,OPTIONS' } })
  }

  // この関数は /api/* にマウントされる。パスはそのまま上流に転送する
  if (!url.pathname.startsWith('/api/') || BLOCKED_PATHS.has(url.pathname)) {
    return jsonError('not found', 404)
  }

  if (!API_ORIGIN || !API_TOKEN) {
    // 設定漏れは詳細を出さない（ログには履く）
    console.error('api proxy: API_ORIGIN / API_TOKEN が未設定です')
    return jsonError('proxy misconfigured', 500)
  }

  const isWrite = req.method === 'POST' || req.method === 'DELETE'
  if (isWrite) {
    const verdict = await verifyTurnstile(req.headers.get('x-turnstile-token'), context.ip)
    if (!verdict.ok) {
      console.error(`api proxy: write rejected (${verdict.error}) ip=${context.ip ?? '-'}`)
      return jsonError('bot check failed', 403)
    }
  }

  // --- ボディ（POST/DELETE のみ） ---
  let body
  if (isWrite) {
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) return jsonError('payload too large', 413)
    const text = await req.text()
    if (text) body = text
  }

  // --- 上流に中継 ---
  let res
  try {
    res = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        ...(body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': String(new TextEncoder().encode(body).length),
            }
          : {}),
        // 上流のレート制限・監査ログ用。クライアントから送られた同ヘッダは上に書かず無視する
        ...(context.ip ? { 'X-Client-IP': context.ip } : {}),
        // 上流で PROXY_SECRET が設定されている時だけ意味を持つ（トンネル直叩き書き込みの阻止）
        ...(PROXY_SECRET ? { 'X-Proxy-Secret': PROXY_SECRET } : {}),
      },
      ...(body ? { body } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (e) {
    console.error(`api proxy: upstream error ${url.pathname}:`, e)
    return jsonError('upstream unavailable', 502)
  }

  const resHeaders = {
    ...securityHeaders(),
    'Content-Type': res.headers.get('content-type') ?? 'application/json',
  }
  // 204 / HEAD はボディを返してはいけない
  const empty = res.status === 204 || req.method === 'HEAD'
  return new Response(empty ? null : await res.text(), {
    status: res.status,
    headers: resHeaders,
  })
}

export const config = {
  path: '/api/*',
}

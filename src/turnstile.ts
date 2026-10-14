/**
 * Cloudflare Turnstile（書き込みの bot 対策）。
 *
 * VITE_TURNSTILE_SITEKEY が未設定（ローカル開発等）の場合は null を返し、
 * Netlify Function 側も TURNSTILE_SECRET 未設定時は検証をスキップする。
 * sitekey は公開値（バンドルに埋まってよい）。secret は Function 側だけで持つ。
 */
const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY ?? ''
/** Turnstile を運用しているか（false の時はフロントも検証トークンを要求しない） */
export const TURNSTILE_ENABLED = Boolean(SITEKEY)

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let widgetId: string | null = null
let pending: { resolve: (t: string | null) => void; timer: number } | null = null

/** index.html の CDN スクリプト読み込み完了を待つ */
function waitForApi(timeoutMs = 8000): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return new Promise((resolve) => {
    const started = Date.now()
    const t = setInterval(() => {
      if (window.turnstile) {
        clearInterval(t)
        resolve(window.turnstile)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(t)
        resolve(null)
      }
    }, 100)
  })
}

/**
 * 書き込み用の検証トークンを 1 つ取得する（使い切り・300 秒で失効）。
 * 取得失敗時は null。TURNSTILE_ENABLED が true の時は null を書き込み不能として扱う。
 */
export async function getWriteToken(): Promise<string | null> {
  if (!SITEKEY) return null
  const api = await waitForApi()
  if (!api) return null

  if (widgetId === null) {
    // 画面外に invisible ウィジェットを 1 個だけ置き、使い回す
    const host = document.createElement('div')
    host.setAttribute('aria-hidden', 'true')
    host.style.position = 'fixed'
    host.style.left = '-9999px'
    document.body.appendChild(host)
    widgetId = api.render(host, {
      sitekey: SITEKEY,
      size: 'invisible',
      callback: (token: string) => {
        const p = pending
        pending = null
        if (p) {
          clearTimeout(p.timer)
          p.resolve(token)
        }
      },
      'error-callback': () => {
        const p = pending
        pending = null
        if (p) {
          clearTimeout(p.timer)
          p.resolve(null)
        }
      },
    })
  }

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      pending = null
      resolve(null)
    }, 30_000)
    pending = { resolve, timer }
    // 前のトークンを使い回さないためリセットして新規チャレンジを回す
    api.reset(widgetId as string)
  })
}

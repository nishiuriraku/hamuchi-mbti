/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * hamuchi-mbti API のベースURL（例: http://localhost:3001）。
   * 未設定なら同一オリジン（Netlify Function の /api/* プロキシ）を使う。
   * 認証トークンは Netlify Function 側の環境変数（API_TOKEN）で保持し、
   * VITE_* 変数には含めない（バンドルは誰でも読めるため）。
   */
  readonly VITE_API_BASE?: string
  /**
   * Cloudflare Turnstile の sitekey（公開値。バンドルに埋まってよい）。
   * 未設定なら bot 検証なしで動作する（ローカル開発用）。
   * ダッシュボードのテスト用キー 1x00000000000000000000AA を dev に使える。
   */
  readonly VITE_TURNSTILE_SITEKEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

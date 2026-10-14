/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** hamuchi-mbti API のベースURL（例: https://mbti-api.example.com）。未設定なら同一オリジン */
  readonly VITE_API_BASE?: string
  /** API の共有トークン（サーバーの API_TOKEN と対応） */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

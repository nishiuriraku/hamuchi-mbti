# hamuchi-mbti (HAMUBTI)

MBTI 16タイプのメンバーを登録してグラフ表示するアプリ。
データは **SQLite** の API サーバー経由で共有し、フロントは **Netlify** の静的ホスティング。

```
[Netlify: Vue SPA]  ──fetch──▶  [Cloudflare Tunnel]  ──▶  [API サーバー: Bun + SQLite]
```

## 構成

| パス | 中身 |
|------|------|
| `src/` | Vue 3 + Vite + TS + Tailwind v4 + Chart.js のフロント |
| `server/` | Bun + `bun:sqlite` の API（外部依存ゼロ。`bun install` 不要） |
| `server/data/mbti.db` | SQLite DB（git 管理外。WAL モード） |

### スキーマ

```sql
CREATE TABLE members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mbti       TEXT NOT NULL,   -- 'INTJ' 〜 'ESFP'
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

MBTI タイプの日本語名などのメタ情報は `src/data.ts` が単一の真実源。
DB にはメンバーの名前だけを持たせ、フロントでマージする。

## ローカル開発

```bash
bun install                  # フロントの依存（bun-types 等）

# ターミナル1: API
cp server/.env.example server/.env   # API_TOKEN は任意（未設定なら認証なし）
bun run api                        # :3001

# ターミナル2: フロント
cp .env.example .env.local         # VITE_API_BASE=http://localhost:3001
bun run dev                        # :5173
```

- `bun run api:test` … store 層のセルフテスト（HTTP を介さない）
- `bun run type-check` / `bun run build`
- `bun run api:seed <exported.json>` … エクスポート JSON から DB を seed

## API

認証: `Authorization: Bearer <API_TOKEN>` または `X-API-Token: <API_TOKEN>`。
サーバーで `API_TOKEN` を設定している場合のみ照合する。

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | 死活確認 |
| GET | `/api/members` | 全16タイプの members マップ `{ INTJ: [{id,name}], ... }` |
| POST | `/api/members` | `{mbti, name}` を追加。作成行を返す |
| DELETE | `/api/members/:id` | id 指定で削除 |
| POST | `/api/import` | JSON 丸ごと全置換（アプリのエクスポート形式・旧 localStorage 形式の両方に対応） |

## localStorage → SQLite マイグレーション

1. 旧アプリで「ファイルに保存」→ `hamu-mbti.json`（旧形式: `members: string[]`）を出力
2. サーバー上で `bun run server/seed.ts hamu-mbti.json`（または `/api/import` に POST）
3. フロントをデプロイ（`src/api.ts` 経由で DB を参照する版）

旧 localStorage のキー `mbtis` はもう参照しないので、ブラウザの DevTools から削除してよい。

## デプロイ

### フロント（Netlify）

- Build command: `bun run build`、Publish directory: `dist`
- Environment variables:
  - `VITE_API_BASE` … API の公開 URL（Cloudflare Tunnel のホスト名）
  - `VITE_API_TOKEN` … サーバーの `API_TOKEN` と同じ値

### API サーバー

任意のディレクトリ（例: `~/hamuchi-mbti-api/`）に `server/` を置き、systemd で常駐させる。

`server/.env`:

```
PORT=3001
DB_PATH=./data/mbti.db
API_TOKEN=<ランダムな文字列>
ALLOWED_ORIGIN=https://<netlify-site>.netlify.app
```

`hamuchi-mbti-api.service`（`/etc/systemd/system/`）:

```ini
[Unit]
Description=hamuchi-mbti api
After=network.target

[Service]
WorkingDirectory=/home/<user>/hamuchi-mbti-api
EnvironmentFile=/home/<user>/hamuchi-mbti-api/.env
ExecStart=/home/<user>/.bun/bin/bun run index.ts
Restart=always
RestartSec=3
User=<user>

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hamuchi-mbti-api
sudo journalctl -u hamuchi-mbti-api -f
```

外部公開は Cloudflare Tunnel（remotely-managed / トークン管理のトンネル）。
 ingress はローカルファイルではなく **Cloudflare ダッシュボード** で管理するので、
 Zero Trust ダッシュボード → Networks → Tunnels → 対象トンネル → Public Hostname に追加する:

| Public hostname | Service |
|-----------------|---------|
| `<your-api-hostname>` | `http://localhost:3001` |

Type は HTTP。ホスト名のドメインが Cloudflare アカウント内のゾーンであれば、
 route 追加時に CNAME（→ `<UUID>.cfargotunnel.com`）が自動作成される（DNS → Records で確認）。
追加後に `https://<your-api-hostname>/api/health` で到達確認できる。
この URL を Netlify の `VITE_API_BASE` に設定する。

> 注意: `cfargotunnel.com` は「同一 Cloudflare アカウントのゾーン内 CNAME」にしか
> プロキシしない設計。Netlify DNS 等の外部 DNS に CNAME を貼る方式は到達しない。

### バックアップ

SQLite はファイル1個なのでコピーするだけ:

```bash
sqlite3 ~/hamuchi-mbti-api/data/mbti.db ".backup '/tmp/mbti-backup.db'"
```

（WAL モードなので生ファイルコピーよりも `.backup` が安全。cron で日次取得推奨。）

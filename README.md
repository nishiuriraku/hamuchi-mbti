# hamuchi-mbti (HAMUBTI)

MBTI 16タイプのメンバーを登録してグラフ表示するアプリ。
データは **SQLite** の API サーバー経由で共有し、フロントは **Netlify** の静的ホスティング。

```
[Netlify: Vue SPA] --同一オリジン /api/*--> [Netlify Function プロキシ] --Bearer--> [Cloudflare Tunnel] --> [API サーバー: Bun + SQLite @ 127.0.0.1:3001]
```

認証トークンは Netlify Function の環境変数（`API_TOKEN`）にのみ存在させ、
フロントのバンドルには含めない（`VITE_*` はビルド後の JS に平文で埋まるため）。

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
cp server/.env.example server/.env   # API_TOKEN は任意（未設定なら認証なし・ローカル限定）
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
サーバーで `API_TOKEN` を設定している場合のみ照合する（定数時間比較）。
ブラウザ（Netlify）からは Function プロキシ経由で呼ばれるため、SPA 側でトークンを扱わない。

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | 死活確認（認証なし・監視用） |
| GET | `/api/members` | 全16タイプの members マップ `{ INTJ: [{id,name}], ... }` |
| POST | `/api/members` | `{mbti, name}` を追加。作成行を返す。**Turnstile トークン必須** |
| DELETE | `/api/members/:id` | id 指定で削除。**Turnstile トークン必須** |
| ~~POST~~ | ~~`/api/import`~~ | **公開経路から削除済み**（全置換は `bun run server/seed.ts` で実行） |

> **GET は公開**で、これは仕様。画面に表示している情報を JSON で返すだけなので、
> 隠しても意味がない（ページを見れば取れる情報）。機械的なスクレイピング・連打への
> 対策はレート制限（read 120/min per IP）と Cloudflare WAF で行う。
> 一方で**書き込みは bot 対策として Cloudflare Turnstile を必須**にしている。

## localStorage → SQLite マイグレーション

1. 旧アプリで「ファイルに保存」→ `hamu-mbti.json`（旧形式: `members: string[]`）を出力
2. サーバー上で `bun run server/seed.ts hamu-mbti.json` を実行（全置換はサーバー管理者のみ）
3. フロントをデプロイ（`src/api.ts` 経由で DB を参照する版）

旧 localStorage のキー `mbtis` はもう参照しないので、ブラウザの DevTools から削除してよい。

## デプロイ

### 構成（セキュリティ改修後）

```
[Netlify: Vue SPA]
   └─ 同一オリジン /api/* ─▶ [Netlify Function プロキシ（api.mjs）]
                                  └─ Bearer <API_TOKEN> ─▶ [Cloudflare Tunnel]
                                                                  └─▶ [Bun API @ 127.0.0.1:3001]
```

- トークンは **Netlify Function の環境変数だけ** に置く。`VITE_*` は使わない。
- API は `127.0.0.1:3001` で listen。外部から直接叩けず、通り道はトンネルのみ。
- 書き込み（POST/DELETE）は Function で **Turnstile 検証**を通してから中継する。
- `/api/import`（全置換）は公開経路に存在しない（サーバー側 seed のみ）。

### フロント + Function（Netlify）

`netlify.toml` がリポジトリに入っているので、Netlify の Build settings は既定のままでよい
（Build command `bun run build` / Publish directory `dist` / Functions directory `netlify/functions`）。

Netlify ダッシュボード → Site configuration → Environment variables に設定:

| 変数 | 用途 | 公開範囲 |
|------|------|----------|
| `API_ORIGIN` | 上流 API のオリジン（`https://<your-api-hostname>`） | Function のみ |
| `API_TOKEN` | 上流 API の `API_TOKEN` と同値 | Function のみ |
| `PROXY_SECRET` | 任意。設定すると上流も同名変数を要求し、書き込みを Function 経由に限定 | Function のみ |
| `TURNSTILE_SECRET` | 任意。設定すると POST/DELETE を Turnstile 検証済みだけに限定 | Function のみ |
| `VITE_TURNSTILE_SITEKEY` | Turnstile の sitekey（公開値。フロントが埋め込む） | バンドル（公開でよい） |

> `VITE_` プレフィックスを付けないこと（`API_TOKEN` 等）。付けるとビルド後の JS に埋まって誰でも読める。
> `VITE_API_BASE` はローカル開発（API 直叩き）専用。本番では未設定で Function 経由になる。
> `VITE_TURNSTILE_SITEKEY` は例外的に `VITE_` 付きでよい（sitekey は設計上公開）。

### Cloudflare Turnstile の設定（書き込み bot 対策）

1. Cloudflare ダッシュボード → Turnstile → **Add site**
   - Site name 任意、Domain に `hamubit.netlify.app` を追加、Mode は `Managed`
2. 発行された **Sitekey** を Netlify の `VITE_TURNSTILE_SITEKEY` に、
   **Secret key** を `TURNSTILE_SECRET` に設定
3. 再デプロイで、SPA の追加/削除ボタン時に invisible ウィジェットが走り、
   Function が siteverify で検証してから上流に中継する（トークンは使い切り）
4. `TURNSTILE_SECRET` 未設定なら検証スキップ（ローカル開発用）

開発用手抜きキー（ダッシュボード不要・どこでも動く）:

```
VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA   # 常にパスする sitekey
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

> IP 制限で「Netlify の IP からだけ受け付ける」方式はできない（リクエストは各閲覧者の
> ブラウザから出るため、Netlify IP 制限＝全ユーザー拒否になる）。Function 経由だけに
> 絞る仕組みが `PROXY_SECRET`、bot 絞りが Turnstile。

### API サーバー

任意のディレクトリ（例: `~/hamuchi-mbti-api/`）に `server/` を置き、systemd で常駐させる。

`server/.env`（`.env.example` をコピー。パーミッションは 600 推奨）:

```
PORT=3001
HOST=127.0.0.1
DB_PATH=./data/mbti.db
API_TOKEN=<ランダムな文字列>       # 本番では必須（未設定だと production 起動を拒否）
PROXY_SECRET=<ランダムな文字列>    # 任意。Netlify 側の同名変数と同値
```

`hamuchi-mbti-api.service`（`/etc/systemd/system/`）:

```ini
[Unit]
Description=hamuchi-mbti api
After=network.target

[Service]
WorkingDirectory=/home/<user>/hamuchi-mbti-api
EnvironmentFile=/home/<user>/hamuchi-mbti-api/.env
Environment=NODE_ENV=production
ExecStart=/home/<user>/.bun/bin/bun run index.ts
Restart=always
RestartSec=3
User=<user>

# --- ハードニング ---
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/<user>/hamuchi-mbti-api/data
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
AmbientCapabilities=
# bun は JIT を使うので MemoryDenyWriteExecute は true にしない
# SystemCallFilter=@system-service   # 起動失敗するならこの行は外す

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hamuchi-mbti-api
sudo journalctl -u hamuchi-mbti-api -f   # [audit] 行で書き込みの記録が追える
```

### Cloudflare Tunnel

外部公開は Cloudflare Tunnel（remotely-managed / トークン管理のトンネル）。
ingress はローカルファイルではなく **Cloudflare ダッシュボード** で管理するので、
Zero Trust ダッシュボード → Networks → Tunnels → 対象トンネル → Public Hostname に追加する:

| Public hostname | Service |
|-----------------|---------|
| `<your-api-hostname>` | `http://localhost:3001` |

Type は HTTP。ホスト名のドメインが Cloudflare アカウント内のゾーンであれば、
route 追加時に CNAME（→ `<UUID>.cfargotunnel.com`）が自動作成される（DNS → Records で確認）。
追加後に `https://<your-api-hostname>/api/health` で到達確認できる。
この URL を Netlify の `API_ORIGIN` に設定する。

> 注意: `cfargotunnel.com` は「同一 Cloudflare アカウントのゾーン内 CNAME」にしか
> プロキシしない設計。Netlify DNS 等の外部 DNS に CNAME を貼る方式は到達しない。

#### ダッシュボードで追加したい防御（トンネル利用は Cloudflare の管理画面設定）

1. **WAF rate limiting rule**（Security → WAF → Rate limiting rules）
   対象: `<your-api-hostname>` の `/*`
   目安: 100 requests / 1 minute per IP、Action: Managed Challenge
   → アプリ層のレート制限（read 120/min・write 20/min per IP）の前に CF  edge で落とす。
2. **Bot Fight Mode**（Security → Bots）… 無印でよい。簡易スキャナ・脆弱スキャンを CDN 側で間引く。
3. **トンネルトークンの管理**
   - トンネルトークン（`cloudflared service install <token>` で使う長い文字列）は
     パスワード同等に扱う。漏えたらダッシュボードからトンネルを作り直す。
   - `cloudflared` は最新版を保つ（`winget upgrade Cloudflare.cloudflared` / apt の自動更新）。
4. 必要なら **Cloudflare Access**（Zero Trust → Access → Applications）で hostname 全体に
   メール OTP をかけ、Function からのみ通す運用にもできる（Bot 対策の強化版。
   アプリが完全公開であるため通常は不要）。

### 防御一覧（実装済み）

| 項目 | 内容 |
|------|------|
| 待ち受け | `HOST=127.0.0.1` 既定。LAN からのトンネルバイパスを遮断 |
| 認証 | `API_TOKEN` 必須（`NODE_ENV=production` で未設定なら起動拒否）。比較は `timingSafeEqual` |
| プロキシ限定 | `PROXY_SECRET` 設定時、書き込みは `X-Proxy-Secret` 所持（= Function）経由のみ |
| bot 対策 | `TURNSTILE_SECRET` 設定時、POST/DELETE は Turnstile トークン検証必須（Function 側で siteverify・使い切り・fail closed） |
| import 廃止 | `/api/import`（全置換）はサーバー・Function の両方で 404。全置換は `bun run server/seed.ts` のみ |
| レート制限 | IP 単位スライディングウィンドウ。read 120/min・write 20/min（`RATE_LIMIT_READ/WRITE` で調整） |
| ボディ上限 | 256KB（`maxRequestBodySize` + `content-length` 早期 413） |
| 件数上限 | DB 全体 2,000 件（`MAX_DB_MEMBERS`）。add は 409・import 超過は 400 |
| 監査ログ | 全書き込みを `[audit] ts ip=… method path status` で標準出力（journald）に記録 |
| ヘッダ | `Cache-Control: no-store`・`X-Content-Type-Options: nosniff` を全応答に付与 |
| CORS | 既定は不許可（`ALLOWED_ORIGIN` 未設定なら ACAO なし）。ブラウザ直叩きする場合だけ設定 |

> 割り切りのポイント: GET は匿名公開（画面に見えている情報だから）。
> IP でのアクセス元制限は「ブラウザが各閲覧者から直接 fetch する」構造上成立しないので、
> bot 遮断は Turnstile + WAF + レート制限の多層でやる。

### バックアップ

SQLite はファイル1個なのでコピーするだけ:

```bash
sqlite3 ~/hamuchi-mbti-api/data/mbti.db ".backup '/tmp/mbti-backup.db'"
```

（WAL モードなので生ファイルコピーよりも `.backup` が安全。cron で日次取得推奨。）
バックアップファイルもメンバー名が入るので、保存先のパーミッションに注意。

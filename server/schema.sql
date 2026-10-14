-- hamuchi-mbti のスキーマ定義。
-- server/store.ts の openDb() が同じ DDL を実行するので、通常はこのファイルを
-- 手で適用する必要はない（.sqlite3  CLI で確認・手動メンテ用のリファレンス）。

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mbti       TEXT NOT NULL,             -- 'INTJ' 〜 'ESFP'
  name       TEXT NOT NULL,             -- メンバー名
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_members_mbti ON members (mbti);

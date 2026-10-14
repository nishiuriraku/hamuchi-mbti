/**
 * hamuchi-mbti API のデータアクス層。
 * bun:sqlite（外部依存ゼロ）を使い、members テーブルを操作する。
 */
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { MBTI_TYPES, isMBTI } from './mbti'

export interface Member {
  id: number
  name: string
}

interface MemberRow {
  id: number
  mbti: string
  name: string
}

/** 4xx を投げるための小さなエラークラス */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/** DB 全体のメンバー上限（連続投稿による DB 肥大化・import 濫用の防御） */
export const MAX_DB_MEMBERS = 2000
/** addMember と同じ名前制約を import 時にも適用する */
export const MAX_NAME_LENGTH = 50

export function openDb(path?: string): Database {
  const raw = path ?? process.env.DB_PATH ?? './data/mbti.db'
  // ':memory:' は SQLite のインメモリ指定。それ以外はディレクトリを作ってから開く
  let dbPath = raw
  if (raw !== ':memory:') {
    dbPath = resolve(raw)
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      mbti       TEXT NOT NULL,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_members_mbti ON members (mbti);
  `)
  return db
}

/** 全16タイプをキーに持つ members マップを返す（フロントはそのままマージできる） */
export function collectMembers(db: Database): Record<string, Member[]> {
  const out: Record<string, Member[]> = {}
  for (const k of MBTI_TYPES) out[k] = []
  const rows = db.query('SELECT id, mbti, name FROM members ORDER BY id').all() as MemberRow[]
  for (const r of rows) {
    if (out[r.mbti]) out[r.mbti].push({ id: r.id, name: r.name })
  }
  return out
}

export function addMember(db: Database, mbti: string, name: string): Member {
  if (!isMBTI(mbti)) throw new HttpError(400, 'unknown mbti')
  const trimmed = name.trim()
  if (!trimmed) throw new HttpError(400, 'name is empty')
  if (trimmed.length > MAX_NAME_LENGTH) throw new HttpError(400, 'name is too long')
  const count = (db.query('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n
  if (count >= MAX_DB_MEMBERS) throw new HttpError(409, 'member limit reached')
  const info = db.query('INSERT INTO members (mbti, name) VALUES (?, ?)').run(mbti, trimmed)
  return { id: Number(info.lastInsertRowid), name: trimmed }
}

export function deleteMember(db: Database, id: number): boolean {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'invalid id')
  const info = db.query('DELETE FROM members WHERE id = ?').run(id)
  return info.changes > 0
}

/** インポート形式の member（新形式 {id,name} と旧 localStorage 形式 string の両方を許容） */
type ImportMember = string | { id?: number; name?: string }

/**
 * 全メンバーを入れ替える（インポート / seed 共通）。
 * 次の2つの形式を受け付ける:
 *   - アプリのエクスポート形式: { INTJ: { name, group, groupName, members: [...] }, ... }
 *   - 簡易形式:                  { INTJ: ["名前", ...], ... }
 * members の要素は {id,name}[]（新形式）と string[]（旧 localStorage 形式）の両方可。
 * addMember と同じく、名前が空または MAX_NAME_LENGTH 超の行は保存しない。
 * 取り込み行数が MAX_DB_MEMBERS を超える場合は 400。
 */
export function replaceAllMembers(db: Database, payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new HttpError(400, 'invalid json')
  }
  const rows: Array<{ mbti: string; name: string }> = []
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!isMBTI(key)) continue
    // エクスポート形式なら .members を取り出す
    const list: unknown =
      Array.isArray(value) ? value : (value as { members?: unknown } | null)?.members
    if (!Array.isArray(list)) continue
    for (const m of list as ImportMember[]) {
      const name =
        typeof m === 'string' ? m.trim() : typeof m?.name === 'string' ? m.name.trim() : ''
      if (name && name.length <= MAX_NAME_LENGTH) rows.push({ mbti: key, name })
    }
  }
  if (rows.length > MAX_DB_MEMBERS) throw new HttpError(400, 'too many members')
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM members')
    const stmt = db.query('INSERT INTO members (mbti, name) VALUES (?, ?)')
    for (const r of rows) stmt.run(r.mbti, r.name)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return rows.length
}

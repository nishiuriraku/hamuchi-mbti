/**
 * エクスポートJSON（旧 localStorage 形式でも可）から members を seed する。
 *
 *   bun run server/seed.ts path/to/hamu-mbti.json
 */
import { openDb, replaceAllMembers } from './store'

const file = process.argv[2]
if (!file) {
  console.error('usage: bun run server/seed.ts <exported.json>')
  process.exit(1)
}

const payload = await Bun.file(file).json()
const db = openDb()
const imported = replaceAllMembers(db, payload)
console.log(
  `imported ${imported} members from ${file} -> ${process.env.DB_PATH ?? './data/mbti.db'}`,
)

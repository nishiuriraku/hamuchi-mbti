/**
 * store 層の軽量セルフテスト（HTTP を介さないので PowerShell/curl の
 * クォート問題に巻き込まれない）:
 *
 *   bun run server/selftest.ts
 */
import {
  HttpError,
  addMember,
  collectMembers,
  deleteMember,
  openDb,
  replaceAllMembers,
} from './store'

const db = openDb(':memory:')
let failed = 0
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`)
  if (!cond) failed++
}

const first = addMember(db, 'INTJ', 'はむ')
check('add は id を採番する', first.id === 1 && first.name === 'はむ')
check('name は trim される', addMember(db, 'INTJ', '  たろう  ').name === 'たろう')

try {
  addMember(db, 'INTJ', '   ')
  check('空名前は例外', false)
} catch (e) {
  check('空名前は 400', e instanceof HttpError && e.status === 400)
}

try {
  addMember(db, 'XXXX', 'x')
  check('不正 mbti は例外', false)
} catch (e) {
  check('不正 mbti は 400', e instanceof HttpError && e.status === 400)
}

check('delete は成功すると true', deleteMember(db, first.id))
check('存在しない delete は false', !deleteMember(db, 9999))

// アプリのエクスポート形式（{ INTJ: { members: [...] } }）
const n1 = replaceAllMembers(db, {
  INTJ: { members: ['a', ' b ', 42, { name: 'c' }] },
  XXXX: { members: ['ignored'] },
})
check('エクスポート形式で 3 件（数値・未知キーはスキップ）', n1 === 3)
check('未知キーは保存しない', !('XXXX' in collectMembers(db)))

// 簡易形式（{ INTJ: [...] }）でも動く
const n2 = replaceAllMembers(db, { INFP: ['x'] })
check('簡易形式で 1 件', n2 === 1)

// 新形式（{id,name}[]）
const n3 = replaceAllMembers(db, { INFP: [{ id: 5, name: 'y' }, { id: 6, name: 'z' }] })
check('新形式で 2 件（id は採番し直し）', n3 === 2)

const m = collectMembers(db)
check('全16キーが揃う', Object.keys(m).length === 16)
check('INFP が 2 件', m.INFP.length === 2)
check('他タイプは空', m.INTJ.length === 0)

try {
  replaceAllMembers(db, null)
  check('null は例外', false)
} catch (e) {
  check('null は 400', e instanceof HttpError && e.status === 400)
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)

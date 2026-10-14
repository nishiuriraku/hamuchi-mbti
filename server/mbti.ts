/**
 * サーバー側で扱う MBTI タイプの一覧。
 * フロントの src/data.ts（日本語名・グループなどのメタ情報）と対応させること。
 * MBTI は固定の16タイプなので、ここが変わることは基本的にない。
 */
export const MBTI_TYPES = [
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP',
] as const

export type MBTI = (typeof MBTI_TYPES)[number]

const MBTI_SET = new Set<string>(MBTI_TYPES)

export function isMBTI(key: string): key is MBTI {
  return MBTI_SET.has(key)
}

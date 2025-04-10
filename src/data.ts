export type MBTI =
  | 'INTJ'
  | 'INTP'
  | 'ENTJ'
  | 'ENTP'
  | 'INFJ'
  | 'INFP'
  | 'ENFJ'
  | 'ENFP'
  | 'ISTJ'
  | 'ISFJ'
  | 'ESTJ'
  | 'ESFJ'
  | 'ISTP'
  | 'ISFP'
  | 'ESTP'
  | 'ESFP'
export type MBTIGroup = 'analysts' | 'diplomats' | 'sentinels' | 'explorers'

export interface MBTIData {
  name: string
  group: MBTIGroup
  groupName: string
  members: Array<string>
}

export type MBTIDatas = {
  [key in MBTI]: MBTIData
}

const data: MBTIDatas = {
  INTJ: {
    name: '建築家',
    group: 'analysts',
    groupName: '分析家',
    members: [],
  },
  INTP: {
    name: '論理学者',
    group: 'analysts',
    groupName: '分析家',
    members: [],
  },
  ENTJ: {
    name: '指揮官',
    group: 'analysts',
    groupName: '分析家',
    members: [],
  },
  ENTP: {
    name: '討論者',
    group: 'analysts',
    groupName: '分析家',
    members: [],
  },

  INFJ: {
    name: '提唱者',
    group: 'diplomats',
    groupName: '外交官',
    members: [],
  },
  INFP: {
    name: '仲介者',
    group: 'diplomats',
    groupName: '外交官',
    members: [],
  },
  ENFJ: {
    name: '主人公',
    group: 'diplomats',
    groupName: '外交官',
    members: [],
  },
  ENFP: {
    name: '運動家',
    group: 'diplomats',
    groupName: '外交官',
    members: [],
  },

  ISTJ: {
    name: '管理者',
    group: 'sentinels',
    groupName: '番人',
    members: [],
  },
  ISFJ: {
    name: '擁護者',
    group: 'sentinels',
    groupName: '番人',

    members: [],
  },
  ESTJ: {
    name: '幹部',
    group: 'sentinels',
    groupName: '番人',
    members: [],
  },
  ESFJ: {
    name: '領事官',
    group: 'sentinels',
    groupName: '番人',
    members: [],
  },

  ISTP: {
    name: '巨匠',
    group: 'explorers',
    groupName: '探検家',
    members: [],
  },
  ISFP: {
    name: '冒険家',
    group: 'explorers',
    groupName: '探検家',
    members: [],
  },
  ESTP: {
    name: '起業家',
    group: 'explorers',
    groupName: '探検家',
    members: [],
  },
  ESFP: {
    name: 'エンターテイナー',
    group: 'explorers',
    groupName: '探検家',
    members: [],
  },
}

export default data

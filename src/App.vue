<script setup lang="ts">
import { onMounted, ref, computed, useTemplateRef } from 'vue'
import defaultData from './data.ts'
import type { MBTI, MBTIDatas, MBTIGroup } from './data.ts'

import { Bar, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement,
} from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
}

const colorFn = (color: string) => Array.from(Array(4)).map(() => color)
const datas = ref(defaultData)
const chartData = computed(() => ({
  labels: Object.entries(defaultData).map(([k, v]) => `${k} (${v.name})`),
  datasets: [
    {
      data: Object.values(datas.value).map((v) => v.members.length),
      label: '人数',
      backgroundColor: [
        ...colorFn('#88619a'),
        ...colorFn('rgb(51, 164, 116)'),
        ...colorFn('rgb(66, 152, 180)'),
        ...colorFn('rgb(228, 174, 58)'),
      ],
    },
  ],
}))

const setItem = (data: MBTIDatas) => {
  localStorage.setItem('mbtis', JSONCrush.crush(JSON.stringify(data)))
}

import JSONCrush from 'jsoncrush'

onMounted(() => {
  const savedValue = localStorage.getItem('mbtis')
  if (!savedValue) {
    return setItem(defaultData)
  }
  datas.value = JSON.parse(JSONCrush.uncrush(savedValue))
})

const type = ref<MBTI | ''>('')
const name = ref('')
const onClick = () => {
  if (name.value && type.value) {
    datas.value[type.value].members.push(name.value)
    setItem(datas.value)
  } else {
    alert('名前とMBTIを選んでください。')
  }
}
const onDelete = (members: string[], index: number) => {
  const member = members[index]
  if (confirm(`${member} を削除していいですか？`)) {
    const deletedMember = members.filter((_, i) => i !== index)
    if (type.value) datas.value[type.value].members = deletedMember
    setItem(datas.value)
  }
}

import { downloadJson, blobToJson } from './jsonUtil'
const importRef = useTemplateRef('importRef')
const onImport: HTMLInputElement['onchange'] = async (e) => {
  const el = e.target as HTMLInputElement
  try {
    const json = (await blobToJson(el.files?.[0])) as MBTIDatas
    datas.value = json
    setItem(json)
  } catch (e) {
    alert('インポート失敗')
    console.error(e)
  }
}

const onExport = () => {
  downloadJson(datas.value, 'hamu-mbti.json')
}

const deleteMode = ref(false)

const groupToColor = (group: MBTIGroup) => {
  switch (group) {
    case 'analysts':
      return 'purple' as const
    case 'diplomats':
      return 'teal' as const
    case 'sentinels':
      return 'sky' as const
    case 'explorers':
      return 'yellow' as const
  }
}

const radioColors = {
  purple: 'accent-purple-800',
  teal: 'accent-teal-800',
  sky: 'accent-sky-800',
  yellow: 'accent-yellow-800',
}

const radioLebelColors = {
  purple: 'text-purple-800',
  teal: 'text-teal-800',
  sky: 'text-sky-800',
  yellow: 'text-yellow-800',
}

const badgeColors = {
  purple: 'text-purple-800 bg-purple-100',
  teal: 'text-teal-800 bg-teal-100',
  sky: 'text-sky-800 bg-sky-100',
  yellow: 'text-yellow-800 bg-yellow-100',
}
const badgeDeleteColors = {
  purple: 'text-purple-800 hover:bg-purple-200 hover:text-purple-900',
  teal: 'text-teal-800 hover:bg-teal-200 hover:text-teal-900',
  sky: 'text-sky-800 hover:bg-sky-200 hover:text-sky-900',
  yellow: 'text-yellow-800 hover:bg-yellow-200 hover:text-yellow-900',
}

const borderColors = {
  purple: 'border-purple-800',
  teal: 'border-teal-800',
  sky: 'border-sky-800',
  yellow: 'border-yellow-800',
}
const bgColors = {
  purple: 'bg-purple-50',
  teal: 'bg-teal-50',
  sky: 'bg-sky-50',
  yellow: 'bg-yellow-50',
}

const tab = ref('tab-1')
const changeTab: HTMLButtonElement['onchange'] = (e) => {
  const target = e.target as HTMLButtonElement
  tab.value = target?.id
}
const tabs = [
  { id: 'tab-1', text: '線' },
  { id: 'tab-2', text: 'ドーナツ' },
]
</script>

<template>
  <div class="max-w-[900px] flex flex-col mx-auto px-4">
    <div class="flex flex-wrap flex-col md:flex-row md:justify-between gap-3 md:gap-0 mt-10 mb-10">
      <h1 class="text-3xl font-bold">HAMUBTI</h1>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="text-white bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-gray-200 disabled:text-gray-400 font-medium rounded-full text-sm px-6 py-1 text-center"
          @click="importRef?.click()"
        >
          インポート
        </button>
        <input ref="importRef" type="file" accept="application/json" hidden @change="onImport" />

        <button
          type="button"
          class="text-white bg-green-600 hover:bg-green-800 focus:outline-none focus:ring-4 focus:ring-green-300 disabled:bg-gray-200 disabled:text-gray-400 font-medium rounded-full text-sm px-6 py-1 text-center"
          @click="onExport"
        >
          ファイルに保存
        </button>
      </div>
    </div>

    <ul
      class="flex flex-wrap text-sm font-medium text-center text-gray-500 border-b border-gray-200"
    >
      <li class="me-2" v-for="v in tabs" :key="v.id">
        <button
          :class="`inline-block p-4 rounded-t-lg ${tab === v.id ? 'text-blue-600 bg-gray-100 active' : 'hover:text-gray-600 hover:bg-gray-50'}`"
          :id="v.id"
          @click="changeTab"
        >
          {{ v.text }}
        </button>
      </li>
    </ul>

    <div v-if="tab === 'tab-1'" class="w-full h-[500px]" id="panel-1">
      <Bar id="my-chart-id" :options="chartOptions" :data="chartData" />
    </div>
    <div v-if="tab === 'tab-2'" class="w-full h-[500px]" id="panel-2">
      <Doughnut id="my-chart-doughnut" :options="chartOptions" :data="chartData" />
    </div>

    <div class="mt-10">
      <div class="grid grid-cols-4 gap-4 max-w-400">
        <label
          v-for="([k, v], i) in Object.entries(defaultData)"
          :key="k"
          :class="`border rounded-md ${borderColors[groupToColor(v.group)]} ${bgColors[groupToColor(v.group)]} p-3 cursor-pointer`"
        >
          <div class="flex justify-center items-center gap-2 flex-col md:flex-row">
            <input
              :id="`radio-${i}`"
              type="radio"
              :value="k"
              v-model="type"
              name="radio"
              :class="`w-4 h-4 bg-gray-100 border-gray-300 ${radioColors[groupToColor(v.group)]}`"
            />
            <div
              :class="`text-sm font-medium flex justify-center items-center ${radioLebelColors[groupToColor(v.group)]} min-h-15 md:min-h-auto w-full text-center md:text-left`"
            >
              {{ `${k} (${v.name})` }}
            </div>
          </div>
        </label>
      </div>

      <div v-if="type" class="mt-10">
        <h3 :class="`text-lg font-bold ${radioLebelColors[groupToColor(datas[type].group)]}`">
          {{ type }} {{ datas[type].name }} {{ datas[type].members.length }}人
        </h3>
        <div class="flex flex-wrap gap-2 mt-2">
          <div v-for="(m, index) in datas[type].members" :key="m" class="flex items-center gap-2">
            <span
              id="badge-dismiss-default"
              :class="`inline-flex items-center px-2 py-1 me-2 text-sm font-medium rounded-sm ${badgeColors[groupToColor(datas[type].group)]}`"
            >
              {{ m }}
              <button
                v-if="deleteMode"
                type="button"
                :class="`inline-flex items-center p-1 ms-2 text-sm bg-transparent rounded-xs${badgeDeleteColors[groupToColor(datas[type].group)]}`"
                data-dismiss-target="#badge-dismiss-default"
                aria-label="Remove"
                @click="onDelete(datas[type].members, index)"
              >
                <svg
                  class="w-2 h-2"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 14 14"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                  />
                </svg>
                <span class="sr-only">{{ m }}</span>
              </button>
            </span>
          </div>
        </div>

        <div class="flex justify-end items-center">
          <button
            type="button"
            class="text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 mt-6"
            @click="deleteMode = !deleteMode"
          >
            {{ deleteMode ? 'キャンセル' : '削除' }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-gray-700 text-sm font-bold mb-2 mt-4" for="name"> 名前 </label>
        <input
          class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="name"
          type="text"
          v-model="name"
          placeholder="名前"
        />
      </div>

      <button
        type="button"
        class="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-gray-200 disabled:text-gray-400 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 mt-6"
        @click="onClick"
        :disabled="!name || !type"
      >
        <span v-if="name">「{{ name }}」 を </span
        ><span v-if="type">「{{ type }} {{ datas[type].name }}」 に</span>追加
      </button>
    </div>
  </div>
</template>

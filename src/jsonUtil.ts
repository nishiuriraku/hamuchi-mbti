export const downloadJson = (jsonObject: object, filename: string = 'data.json'): void => {
  const jsonString = JSON.stringify(jsonObject)
  const blob = new Blob([jsonString], {
    type: 'application/json;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const blobToJson = (blob?: Blob | File) => {
  return new Promise((resolve, reject) => {
    if (!blob) return reject('blob is none')
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const jsonString = `${event.target?.result}`
        const jsonObject = JSON.parse(jsonString)
        resolve(jsonObject)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = (error) => {
      reject(error)
    }

    reader.readAsText(blob)
  })
}

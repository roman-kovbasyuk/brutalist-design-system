export const MAX_BRIEF_CHARACTERS = 20000
export const MAX_BRIEF_FILE_BYTES = 5 * 1024 * 1024

export function briefToText(brief) {
  if (!brief) return ''
  const context = [
    ['Product', brief.product],
    ['Audience', brief.audience],
    ['Goal', brief.objective],
    ['Offer', brief.offer],
    ['Language', brief.locale === 'auto' ? '' : brief.locale],
  ]
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => `${label}: ${value}`)
  return [brief.notes, ...context].filter(Boolean).join('\n\n')
}

export function combineBrief(message, files) {
  return [
    message.trim(),
    ...files.map((file) => `Attached brief: ${file.name}\n${file.text.trim()}`),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function briefTitle(text) {
  return (
    text
      .trim()
      .split(/[\n.!?]/)[0]
      .slice(0, 80)
      .trim() || 'New campaign'
  )
}

export function readBriefFile(file) {
  if (!/\.(txt|md|markdown|pdf|docx)$/i.test(file.name))
    return Promise.reject(new Error('Use a TXT, Markdown, PDF, or DOCX brief.'))
  if (!file.size || file.size > MAX_BRIEF_FILE_BYTES)
    return Promise.reject(
      new Error('Choose a non-empty brief file up to 5 MB.'),
    )
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error('The file could not be read. Try attaching it again.'))
    reader.onload = () =>
      resolve({
        name: file.name,
        mimeType: file.type,
        data: String(reader.result).split(',')[1],
      })
    reader.readAsDataURL(file)
  })
}

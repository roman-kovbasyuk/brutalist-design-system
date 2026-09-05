import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const MAX_TEXT_CHARACTERS = 20_000

async function parse({ extension, bytes }) {
  if (extension === '.docx') return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

process.once('message', async (input) => {
  try {
    const text = await parse(input)
    process.send?.(text.length > MAX_TEXT_CHARACTERS ? { error: 'text_too_large' } : { text })
  } catch {
    process.send?.({ error: 'unreadable' })
  }
})

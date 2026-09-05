import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export const MAX_BRIEF_FILE_BYTES = 5 * 1024 * 1024
export const MAX_BRIEF_TEXT_CHARACTERS = 20_000
const MAX_BASE64_LENGTH = Math.ceil(MAX_BRIEF_FILE_BYTES / 3) * 4

const supportedTypes = new Map([
  ['.txt', new Set(['text/plain'])],
  ['.md', new Set(['text/markdown', 'text/x-markdown'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
])

export class BriefFileError extends Error {
  constructor(statusCode, code, publicMessage) {
    super(publicMessage)
    this.name = 'BriefFileError'
    Object.assign(this, { statusCode, code, publicMessage, expose: true })
  }
}

function rejectFile(statusCode, code, message) {
  throw new BriefFileError(statusCode, code, message)
}

function decodeBase64(data) {
  const validLength = typeof data === 'string' && data.length <= MAX_BASE64_LENGTH && data.length % 4 === 0
  const padding = validLength && data.endsWith('==') ? 2 : validLength && data.endsWith('=') ? 1 : 0
  let validCharacters = validLength
  for (let index = 0; validCharacters && index < data.length - padding; index += 1) {
    const code = data.charCodeAt(index)
    validCharacters = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) || code === 43 || code === 47
  }
  if (validCharacters && padding > 0) {
    for (let index = data.length - padding; index < data.length; index += 1) validCharacters = data[index] === '='
  }
  if (!validLength || !validCharacters) {
    rejectFile(data?.length > MAX_BASE64_LENGTH ? 413 : 400,
      data?.length > MAX_BASE64_LENGTH ? 'brief_file_too_large' : 'invalid_brief_file',
      data?.length > MAX_BASE64_LENGTH ? 'The attachment exceeds the 5 MB limit.' : 'The attachment data is malformed.')
  }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.byteLength > MAX_BRIEF_FILE_BYTES) {
    rejectFile(413, 'brief_file_too_large', 'The attachment exceeds the 5 MB limit.')
  }
  return bytes
}

function fileExtension(name) {
  const match = /(?:^|\/)([^/]+)(\.[^.\/]+)$/.exec(name.toLowerCase())
  return match?.[2]
}

async function extractPdf(bytes) {
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(bytes) {
  return (await mammoth.extractRawText({ buffer: bytes })).value
}

export async function extractBriefText({ name, mimeType, data }) {
  const extension = fileExtension(name)
  if (!extension || !supportedTypes.get(extension)?.has(mimeType.toLowerCase())) {
    rejectFile(415, 'unsupported_brief_file', 'Use a TXT, Markdown, text PDF, or DOCX attachment.')
  }
  const bytes = decodeBase64(data)
  let text
  try {
    if (extension === '.txt' || extension === '.md') text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (extension === '.pdf') text = await extractPdf(bytes)
    if (extension === '.docx') text = await extractDocx(bytes)
  } catch (error) {
    if (error instanceof BriefFileError) throw error
    rejectFile(422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.')
  }
  const normalized = text?.replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    rejectFile(422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.')
  }
  if (normalized.length > MAX_BRIEF_TEXT_CHARACTERS) {
    rejectFile(413, 'brief_text_too_large', 'The extracted text exceeds the 20,000 character brief limit.')
  }
  return normalized
}

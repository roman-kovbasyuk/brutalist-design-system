import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const MAX_BRIEF_FILE_BYTES = 5 * 1024 * 1024
export const MAX_BRIEF_TEXT_CHARACTERS = 20_000
const MAX_BASE64_LENGTH = Math.ceil(MAX_BRIEF_FILE_BYTES / 3) * 4
const MAX_DOCX_ENTRIES = 1_000
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
const DEFAULT_PARSE_TIMEOUT_MS = 5_000
const parserRelativePath = './briefDocumentParser.js'
const parserPath = fileURLToPath(new URL(parserRelativePath, import.meta.url))

const supportedTypes = new Map([
  ['.txt', new Set(['text/plain'])],
  ['.md', new Set(['text/markdown', 'text/x-markdown'])],
  ['.markdown', new Set(['text/markdown', 'text/x-markdown'])],
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

function preflightDocx(bytes) {
  const minimumEocdOffset = Math.max(0, bytes.length - 65_557)
  let eocdOffset = -1
  for (let offset = bytes.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) rejectFile(422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.')
  const entryCount = bytes.readUInt16LE(eocdOffset + 10)
  const directorySize = bytes.readUInt32LE(eocdOffset + 12)
  let offset = bytes.readUInt32LE(eocdOffset + 16)
  if (entryCount > MAX_DOCX_ENTRIES || offset + directorySize > eocdOffset) {
    rejectFile(422, 'brief_file_too_complex', 'The DOCX is too complex to process safely. Paste the campaign text instead.')
  }
  let totalUncompressed = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || bytes.readUInt32LE(offset) !== 0x02014b50) {
      rejectFile(422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.')
    }
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    if (uncompressedSize === 0xffffffff) {
      rejectFile(422, 'brief_file_too_complex', 'ZIP64 DOCX attachments are not supported. Paste the campaign text instead.')
    }
    totalUncompressed += uncompressedSize
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) {
      rejectFile(422, 'brief_file_too_complex', 'The DOCX expands beyond the safe processing limit. Paste the campaign text instead.')
    }
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
}

export function parseDocumentInChild({ extension, bytes }, {
  childPath = parserPath, timeoutMs = DEFAULT_PARSE_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(childPath, [], {
      execArgv: ['--max-old-space-size=64', '--stack-size=1024'],
      serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    let settled = false
    const finish = (error, text) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      if (error) reject(error)
      else resolve(text)
    }
    const timer = setTimeout(() => finish(new BriefFileError(
      422, 'brief_file_timeout', 'The attachment took too long to read. Paste the campaign text instead.',
    )), timeoutMs)
    child.once('error', () => finish(new BriefFileError(
      422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.',
    )))
    child.once('exit', () => finish(new BriefFileError(
      422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.',
    )))
    child.once('message', (message) => {
      if (message?.error === 'text_too_large') {
        finish(new BriefFileError(413, 'brief_text_too_large', 'The extracted text exceeds the 20,000 character brief limit.'))
      } else if (typeof message?.text === 'string') {
        finish(null, message.text)
      } else {
        finish(new BriefFileError(422, 'unreadable_brief_file', 'No readable text could be extracted. Paste the campaign text instead.'))
      }
    })
    child.send({ extension, bytes })
  })
}

export async function extractBriefText({ name, mimeType, data }) {
  const extension = fileExtension(name)
  if (!extension || !supportedTypes.get(extension)?.has(mimeType.toLowerCase())) {
    rejectFile(415, 'unsupported_brief_file', 'Use a TXT, Markdown, text PDF, or DOCX attachment.')
  }
  const bytes = decodeBase64(data)
  if (extension === '.docx') preflightDocx(bytes)
  let text
  try {
    if (extension === '.txt' || extension === '.md' || extension === '.markdown') text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (extension === '.pdf' || extension === '.docx') text = await parseDocumentInChild({ extension, bytes })
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

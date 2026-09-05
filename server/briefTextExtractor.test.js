import { describe, expect, test } from 'vitest'
import { ZipArchive } from 'archiver'
import { PassThrough } from 'node:stream'
import { resolve } from 'node:path'
import { extractBriefText, MAX_BRIEF_FILE_BYTES, parseDocumentInChild } from './briefTextExtractor.js'

function textPdf(text) {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

async function textDocx(text) {
  const output = new PassThrough()
  const chunks = []
  output.on('data', (chunk) => chunks.push(chunk))
  const complete = new Promise((resolve, reject) => {
    output.on('end', resolve)
    output.on('error', reject)
  })
  const zip = new ZipArchive({})
  zip.on('error', (error) => output.destroy(error))
  zip.pipe(output)
  zip.append('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', { name: '[Content_Types].xml' })
  zip.append('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', { name: '_rels/.rels' })
  zip.append(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`, { name: 'word/document.xml' })
  await zip.finalize()
  await complete
  return Buffer.concat(chunks)
}

async function expansionDocx() {
  const output = new PassThrough()
  const chunks = []
  output.on('data', (chunk) => chunks.push(chunk))
  const complete = new Promise((resolve, reject) => {
    output.on('end', resolve)
    output.on('error', reject)
  })
  const zip = new ZipArchive({})
  zip.on('error', (error) => output.destroy(error))
  zip.pipe(output)
  zip.append(Buffer.alloc(30 * 1024 * 1024, 97), { name: 'word/document.xml' })
  await zip.finalize()
  await complete
  return Buffer.concat(chunks)
}

describe('brief text extraction', () => {
  test.each([
    ['brief.txt', 'text/plain'],
    ['brief.md', 'text/markdown'],
    ['brief.markdown', 'text/markdown'],
  ])('extracts non-empty UTF-8 text from %s', async (name, mimeType) => {
    await expect(extractBriefText({ name, mimeType, data: Buffer.from('Autumn launch\nFor busy adults').toString('base64') }))
      .resolves.toBe('Autumn launch\nFor busy adults')
  })

  test('rejects malformed base64 before parsing', async () => {
    await expect(extractBriefText({ name: 'brief.txt', mimeType: 'text/plain', data: '%%%not-base64%%%' }))
      .rejects.toMatchObject({ code: 'invalid_brief_file' })
  })

  test('extracts text from a text PDF', async () => {
    await expect(extractBriefText({
      name: 'brief.pdf', mimeType: 'application/pdf', data: textPdf('Autumn launch').toString('base64'),
    })).resolves.toContain('Autumn launch')
  })

  test('locates the document parser independently of the process working directory', async () => {
    const originalDirectory = process.cwd()
    process.chdir('/tmp')
    try {
      await expect(extractBriefText({
        name: 'brief.pdf', mimeType: 'application/pdf', data: textPdf('Portable parser path').toString('base64'),
      })).resolves.toContain('Portable parser path')
    } finally {
      process.chdir(originalDirectory)
    }
  })

  test('extracts text from a DOCX', async () => {
    const bytes = await textDocx('Campaign for busy adults')
    await expect(extractBriefText({
      name: 'brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: bytes.toString('base64'),
    })).resolves.toBe('Campaign for busy adults')
  })

  test('rejects a DOCX whose cumulative uncompressed ZIP size exceeds the parser ceiling', async () => {
    const bytes = await expansionDocx()
    expect(bytes.byteLength).toBeLessThan(MAX_BRIEF_FILE_BYTES)
    await expect(extractBriefText({
      name: 'bomb.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: bytes.toString('base64'),
    })).rejects.toMatchObject({ code: 'brief_file_too_complex' })
  })

  test('kills an isolated parser that exceeds its deadline', async () => {
    await expect(parseDocumentInChild({ extension: '.pdf', bytes: Buffer.from('%PDF-1.4') }, {
      childPath: resolve(process.cwd(), 'server/testFixtures/hangingBriefParser.js'), timeoutMs: 25,
    })).rejects.toMatchObject({ code: 'brief_file_timeout' })
  })

  test('rejects decoded content over five megabytes', async () => {
    const data = Buffer.alloc(MAX_BRIEF_FILE_BYTES + 1, 97).toString('base64')
    await expect(extractBriefText({ name: 'brief.txt', mimeType: 'text/plain', data }))
      .rejects.toMatchObject({ statusCode: 413, code: 'brief_file_too_large' })
  })

  test('rejects unsupported file types explicitly', async () => {
    await expect(extractBriefText({ name: 'brief.rtf', mimeType: 'application/rtf', data: Buffer.from('hello').toString('base64') }))
      .rejects.toMatchObject({ statusCode: 415, code: 'unsupported_brief_file' })
  })

  test('rejects empty extracted text with a paste-text fallback', async () => {
    await expect(extractBriefText({ name: 'brief.txt', mimeType: 'text/plain', data: Buffer.from('  \n').toString('base64') }))
      .rejects.toMatchObject({ code: 'unreadable_brief_file', publicMessage: expect.stringMatching(/paste/i) })
  })
})

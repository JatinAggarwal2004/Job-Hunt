import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extractResume, DocumentError } from './documents.ts'
const fixture = (ext: string) =>
  readFileSync(new URL(`../tests/fixtures/resume.${ext}`, import.meta.url))
const rejectsStatus = (status: number) => (error: unknown) =>
  error instanceof DocumentError && error.status === status

test('extracts existing PDF, DOCX and TXT fixtures in isolated parsers', async () => {
  for (const ext of ['pdf', 'docx', 'txt']) {
    const text = await extractResume(fixture(ext), `resume.${ext}`, 'fixture-user')
    assert.match(text, /Alex Example/)
    assert.match(text, /React/)
  }
})
test('rejects oversized, unsupported, invalid magic, binary TXT and invalid UTF-8 inputs', async () => {
  await assert.rejects(
    extractResume(Buffer.alloc(5 * 1024 * 1024 + 1), 'resume.pdf', 'user'),
    rejectsStatus(413),
  )
  await assert.rejects(
    extractResume(Buffer.from('hello'), 'resume.exe', 'user'),
    rejectsStatus(415),
  )
  await assert.rejects(
    extractResume(Buffer.from('secret contents'), 'secret.pdf', 'user'),
    rejectsStatus(400),
  )
  await assert.rejects(
    extractResume(Buffer.from('secret contents'), 'secret.docx', 'user'),
    rejectsStatus(400),
  )
  await assert.rejects(
    extractResume(Buffer.from('hello\0world'), 'resume.txt', 'user'),
    rejectsStatus(400),
  )
  await assert.rejects(
    extractResume(Buffer.from([0xff, 0xfe, 0xff]), 'resume.txt', 'user'),
    rejectsStatus(400),
  )
  await assert.rejects(
    extractResume(Buffer.alloc(100001, 65), 'resume.txt', 'user'),
    rejectsStatus(413),
  )
})
test('malformed parsers return safe errors and release their capacity', async () => {
  for (const [ext, data] of [
    ['pdf', Buffer.from('%PDF-1.7 secret_PRIVATE_INFO')],
    ['docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])],
  ] as const) {
    await assert.rejects(
      extractResume(data, `PRIVATE_FILE.${ext}`, 'malformed'),
      (error: unknown) => {
        assert.ok(error instanceof DocumentError)
        assert.equal(error.status, 422)
        assert.doesNotMatch(error.message, /PRIVATE|secret/)
        return true
      },
    )
  }
  assert.match(await extractResume(fixture('docx'), 'resume.docx', 'malformed'), /Alex Example/)
})
test('allows two global workers and one per account; rejected requests do not consume capacity', async () => {
  const first = extractResume(fixture('pdf'), 'resume.pdf', 'worker-one')
  await assert.rejects(
    extractResume(fixture('docx'), 'resume.docx', 'worker-one'),
    rejectsStatus(429),
  )
  const second = extractResume(fixture('docx'), 'resume.docx', 'worker-two')
  await assert.rejects(
    extractResume(fixture('docx'), 'resume.docx', 'worker-three'),
    rejectsStatus(429),
  )
  await Promise.all([first, second])
  assert.match(await extractResume(fixture('docx'), 'resume.docx', 'worker-three'), /Alex Example/)
})
test('empty document and scanned PDF without text produce actionable 422', async () => {
  await assert.rejects(extractResume(Buffer.from('  '), 'resume.txt', 'user'), rejectsStatus(422))
  // Minimal valid PDF with a blank page, generated deterministically without new dependencies.
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ]
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(chunks.join('')))
    chunks.push(`${i + 1} 0 obj\n${body}\nendobj\n`)
  })
  const xref = Buffer.byteLength(chunks.join(''))
  chunks.push(
    `xref\n0 4\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  )
  await assert.rejects(
    extractResume(Buffer.from(chunks.join('')), 'scan.pdf', 'scanned'),
    rejectsStatus(422),
  )
})
test('DOCX external hyperlinks are text only and make no HTTP request', async () => {
  const require = createRequire(import.meta.url),
    JSZip = require('jszip')
  let hits = 0
  const server = createServer((_req, res) => {
    hits++
    res.end('PRIVATE_SERVER_CONTENT')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const addr = server.address() as { port: number },
      zip = await JSZip.loadAsync(fixture('docx'))
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://127.0.0.1:${addr.port}/private" TargetMode="External"/></Relationships>`,
    )
    const document = await zip.file('word/document.xml').async('string')
    zip.file(
      'word/document.xml',
      document.replace(
        '</w:body>',
        '<w:p><w:hyperlink r:id="rIdExternal"><w:r><w:t>Portfolio external link</w:t></w:r></w:hyperlink></w:p></w:body>',
      ),
    )
    const text = await extractResume(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'resume.docx',
      'external',
    )
    assert.match(text, /Alex Example/)
    assert.match(text, /Portfolio external link/)
    assert.doesNotMatch(text, /PRIVATE_SERVER_CONTENT/)
    assert.equal(hits, 0)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
test('DOCX decompression bomb is rejected before Mammoth conversion', async () => {
  const require = createRequire(import.meta.url),
    JSZip = require('jszip'),
    zip = new JSZip()
  zip.file('word/document.xml', 'A'.repeat(11 * 1024 * 1024))
  const compressed = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  assert.ok(compressed.length < 5 * 1024 * 1024)
  await assert.rejects(extractResume(compressed, 'resume.docx', 'bomb'), rejectsStatus(422))
})

test('PDF page count above 100 is rejected before text extraction', async () => {
  const pageCount = 101,
    chunks = ['%PDF-1.4\n'],
    offsets = [0]
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>`,
    ),
  ]
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(chunks.join('')))
    chunks.push(`${i + 1} 0 obj\n${body}\nendobj\n`)
  })
  const xref = Buffer.byteLength(chunks.join(''))
  chunks.push(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  )
  await assert.rejects(
    extractResume(Buffer.from(chunks.join('')), 'many-pages.pdf', 'pages'),
    rejectsStatus(422),
  )
})

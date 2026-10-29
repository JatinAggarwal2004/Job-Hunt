import { Worker } from 'node:worker_threads'

export class DocumentError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'DOCUMENT_ERROR',
  ) {
    super(message)
  }
}
const MAX_INPUT = 5 * 1024 * 1024
const MAX_TEXT = 100000
const DEADLINE_MS = 15000
const activeUsers = new Set<string>()
let activeWorkers = 0
const moduleUrls = { pdf: import.meta.resolve('pdf-parse'), docx: import.meta.resolve('mammoth') }

// This is plain JavaScript, deliberately independent of the application's TS loader.
// Only bounded document bytes and resolved installed-module URLs enter the worker.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { inflateRawSync } = require('node:zlib');
function reject(status){const e=new Error('document');e.status=status;throw e;}
function checkArchive(b){
  // Reject ZIP64, multidisk and encrypted archives, and bound actual inflated output
  // before Mammoth/JSZip can allocate strings from attacker-controlled XML.
  let end=-1;
  for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--){if(b.readUInt32LE(p)===0x06054b50){end=p;break;}}
  if(end<0||end+22+b.readUInt16LE(end+20)!==b.length)reject(422);
  const entries=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),offset=b.readUInt32LE(end+16);
  if(b.readUInt16LE(end+4)||b.readUInt16LE(end+6)||entries!==b.readUInt16LE(end+8)||entries===65535||size===0xffffffff||offset===0xffffffff||entries>1000||offset+size>end)reject(422);
  let p=offset,total=0,main=false;const names=new Set();
  for(let n=0;n<entries;n++){
    if(p+46>offset+size||b.readUInt32LE(p)!==0x02014b50)reject(422);
    const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),compressed=b.readUInt32LE(p+20),uncompressed=b.readUInt32LE(p+24),nameLen=b.readUInt16LE(p+28),extra=b.readUInt16LE(p+30),comment=b.readUInt16LE(p+32),local=b.readUInt32LE(p+42);
    if(flags&1||![0,8].includes(method)||uncompressed>10*1024*1024||compressed===0xffffffff||local===0xffffffff||p+46+nameLen+extra+comment>offset+size)reject(422);
    const name=b.subarray(p+46,p+46+nameLen).toString('utf8');
    if(names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\'))reject(422);names.add(name);
    if(local+30>offset||b.readUInt32LE(local)!==0x04034b50||b.readUInt16LE(local+8)!==method)reject(422);
    const localNameLength=b.readUInt16LE(local+26),data=local+30+localNameLength+b.readUInt16LE(local+28);
    if(data+compressed>offset||b.subarray(local+30,local+30+localNameLength).toString('utf8')!==name)reject(422);
    const input=b.subarray(data,data+compressed);
    const output=method===0?input:inflateRawSync(input,{maxOutputLength:10*1024*1024});
    if(output.length!==uncompressed)reject(422);
    total+=output.length;if(total>20*1024*1024)reject(422);
    if(name==='word/document.xml')main=true;
    p+=46+nameLen+extra+comment;
  }
  if(!main||p!==offset+size)reject(422);
}
(async()=>{
 let parser;
 try{
  const buffer=Buffer.from(workerData.bytes);let text='';
  // Neither parser is given a URL or filename. Mammoth extractRawText uses
  // externalFileAccess=false by default and never renders hyperlink targets.
  if(workerData.kind==='docx'){
   checkArchive(buffer);
   const module=await import(workerData.modules.docx);
   text=(await (module.default||module).extractRawText({buffer})).value;
  }else{
   const {PDFParse}=await import(workerData.modules.pdf);
   parser=new PDFParse({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0});
   const info=await parser.getInfo();if(info.total>100)reject(422);
   text=(await parser.getText({first:100,pageJoiner:''})).text;
  }
  if(typeof text!=='string'||text.includes('\0')||text.trim().length<20)reject(422);
  if(text.length>100000)reject(413);
  parentPort.postMessage({ok:true,text});
 }catch(error){parentPort.postMessage({ok:false,status:error.status===413?413:422});}
 finally{if(parser)try{await parser.destroy();}catch{}parentPort.close();}
})();
`

export async function extractResume(
  buffer: Buffer,
  filename: string,
  uid: string,
): Promise<string> {
  if (!Buffer.isBuffer(buffer) || !uid) throw new DocumentError(400, 'Invalid document request')
  if (buffer.length > MAX_INPUT) throw new DocumentError(413, 'Resume file must be 5 MB or smaller')
  const kind = filename.toLowerCase().split('.').pop()
  if (!['pdf', 'docx', 'txt'].includes(kind ?? ''))
    throw new DocumentError(415, 'Supported formats: PDF, DOCX, TXT')
  if (kind === 'txt') {
    if (buffer.includes(0)) throw new DocumentError(400, 'Not a plain text file')
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      throw new DocumentError(400, 'Text files must use UTF-8 encoding')
    }
    if (text.length > MAX_TEXT)
      throw new DocumentError(413, 'Resume text must be 100,000 characters or fewer')
    if (text.trim().length < 20) throw new DocumentError(422, 'No usable resume text found')
    return text
  }
  if (kind === 'pdf' && buffer.subarray(0, 5).toString() !== '%PDF-')
    throw new DocumentError(400, 'Invalid PDF file')
  if (kind === 'docx' && !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    throw new DocumentError(400, 'Invalid DOCX file')
  if (activeWorkers >= 2 || activeUsers.has(uid))
    throw new DocumentError(
      429,
      'Resume processing is busy. Please retry shortly.',
      'DOCUMENT_BUSY',
    )
  activeWorkers++
  activeUsers.add(uid)
  try {
    return await new Promise<string>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(workerSource, {
          eval: true,
          execArgv: [],
          env: {},
          workerData: { bytes: buffer, kind, modules: moduleUrls },
          resourceLimits: {
            maxOldGenerationSizeMb: 128,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
            codeRangeSizeMb: 16,
          },
          stdout: true,
          stderr: true,
        })
      } catch {
        reject(new DocumentError(503, 'Resume processing is temporarily unavailable'))
        return
      }
      worker.stdout?.resume()
      worker.stderr?.resume()
      let finished = false
      const finish = (error: DocumentError | null, text?: string) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        // Capacity is released only after worker termination, including error/OOM paths.
        void worker.terminate().finally(() => {
          worker.removeAllListeners()
          if (error) reject(error)
          else resolve(text!)
        })
      }
      const timer = setTimeout(
        () =>
          finish(
            new DocumentError(
              422,
              'Document processing exceeded the time limit. Paste resume text instead.',
              'DOCUMENT_TIMEOUT',
            ),
          ),
        DEADLINE_MS,
      )
      worker.once('message', (message: unknown) => {
        const m = message as { ok?: boolean; text?: string; status?: number }
        if (
          m?.ok === true &&
          typeof m.text === 'string' &&
          m.text.length <= MAX_TEXT &&
          m.text.trim().length >= 20
        )
          finish(null, m.text)
        else
          finish(
            new DocumentError(
              m?.status === 413 ? 413 : 422,
              m?.status === 413
                ? 'Resume text must be 100,000 characters or fewer'
                : 'Unable to extract usable text. For scanned PDFs, paste resume text instead.',
            ),
          )
      })
      worker.once('error', () =>
        finish(
          new DocumentError(422, 'Unable to process this document. Paste resume text instead.'),
        ),
      )
      worker.once('exit', () =>
        finish(new DocumentError(422, 'Document processing ended before extracting text.')),
      )
    })
  } finally {
    activeWorkers--
    activeUsers.delete(uid)
  }
}

import fs from "node:fs"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { mergeInvoices } from "../lib/invoices.js"

/** 造一张带边框与文字的样例发票。 */
async function invoice(label, landscape) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = landscape ? [841.89, 595.276] : [595.276, 841.89]
  const page = doc.addPage(size)
  page.drawRectangle({ x: 12, y: 12, width: size[0] - 24, height: size[1] - 24, borderColor: rgb(0.85, 0.25, 0.25), borderWidth: 1.5 })
  page.drawText(label, { x: 30, y: size[1] - 60, size: 22, font, color: rgb(0.12, 0.12, 0.14) })
  page.drawText('amount 1280.00 CNY', { x: 30, y: size[1] - 96, size: 12, font, color: rgb(0.3, 0.3, 0.35) })
  return Buffer.from(await doc.save())
}

const files = [
  { name: 'inv-1.pdf', data: (await invoice('Invoice 202611001', false)).toString('base64') },
  { name: 'inv-2.pdf', data: (await invoice('Invoice 202611002', false)).toString('base64') },
  { name: 'inv-3.pdf', data: (await invoice('Invoice 202611003', true)).toString('base64') },
]
const merged = await mergeInvoices({ files, layout: 'side', size: 'a4-portrait', marginMm: 8, cutLine: true })
fs.writeFileSync('dev/sample-merged.pdf', merged.bytes)
console.log('sample:', merged.stats)

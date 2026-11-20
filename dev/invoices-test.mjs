/**
 * 发票合并单元 + 集成测试。
 * 用法：node dev/invoices-test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import {
  computeSlots,
  fitIntoSlot,
  mergeInvoices,
  padSlot,
  pageSizeOf,
  downloadFileName,
  inferLayout,
} from '../lib/invoices.js'

let passed = 0
const check = (label, condition, extra) => {
  assert.ok(condition, `${label}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

const A4P = [595.276, 841.89]
const A4L = [841.89, 595.276]

console.log('invoices: geometry')

const side = computeSlots({ pageW: A4P[0], pageH: A4P[1], marginPt: 28.35, layout: 'side' })
check('左右版式两个槽位等宽', Math.abs(side.slots[0].width - side.slots[1].width) < 0.001)
check('左右版式第二槽在第一槽右侧', side.slots[1].x > side.slots[0].x + side.slots[0].width - 0.001)
check('左右版式裁切线竖向居中', side.cut.axis === 'v' && Math.abs(side.cut.at - A4P[0] / 2) < 0.001, side.cut)
check('槽位不越过页边', side.slots[0].x >= 28.35 - 0.001 && side.slots[1].x + side.slots[1].width <= A4P[0] - 28.35 + 0.001)

const stack = computeSlots({ pageW: A4P[0], pageH: A4P[1], marginPt: 28.35, layout: 'stack' })
check('上下版式第一槽在上方', stack.slots[0].y > stack.slots[1].y)
check('上下版式裁切线横向居中', stack.cut.axis === 'h' && Math.abs(stack.cut.at - A4P[1] / 2) < 0.001, stack.cut)
check('上下版式两槽等高', Math.abs(stack.slots[0].height - stack.slots[1].height) < 0.001)

const padded = padSlot(side.slots[0], 6)
check('内边距收缩四边', padded.x === side.slots[0].x + 6 && padded.width === side.slots[0].width - 12)

const portraitInvoice = { width: 595.276, height: 841.89 }
const rectSide = fitIntoSlot(padded, portraitInvoice)
check('竖版发票等比缩放后完整落在槽内', rectSide.width <= padded.width + 0.001 && rectSide.height <= padded.height + 0.001)
check('竖版发票在槽内水平居中', Math.abs((rectSide.x - padded.x) - (padded.x + padded.width - rectSide.x - rectSide.width)) < 0.001)

const landscapeInvoice = { width: 841.89, height: 595.276 }
const rectStack = fitIntoSlot(padSlot(stack.slots[0], 6), landscapeInvoice)
check('横版发票在上下版式里按宽受限', rectStack.width <= padSlot(stack.slots[0], 6).width + 0.001)
check('横版发票垂直居中', Math.abs((rectStack.y - padSlot(stack.slots[0], 6).y) - (padSlot(stack.slots[0], 6).y + padSlot(stack.slots[0], 6).height - rectStack.y - rectStack.height)) < 0.001)

console.log('invoices: merge')

/**
 * 造一张发票 PDF。
 * @param {number[]} size 页面尺寸。
 * @param {string} label 文本。
 * @param {number} rotate 旋转角度。
 * @returns {Promise<Buffer>} PDF 字节。
 */
async function fixture(size, label, rotate = 0) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(size)
  page.drawRectangle({ x: 8, y: 8, width: size[0] - 16, height: size[1] - 16, borderColor: rgb(0.85, 0.2, 0.2), borderWidth: 1.5 })
  page.drawText(label, { x: 20, y: size[1] - 36, size: 16, font, color: rgb(0.1, 0.1, 0.1) })
  if (rotate) page.setRotation(degrees(rotate))
  return Buffer.from(await doc.save())
}

const files = [
  { name: 'a.pdf', data: (await fixture(A4P, 'Invoice A')).toString('base64') },
  { name: 'b.pdf', data: (await fixture(A4L, 'Invoice B landscape')).toString('base64') },
  { name: 'c.pdf', data: (await fixture([419.53, 595.28], 'Invoice C A5')).toString('base64') },
]

const merged = await mergeInvoices({ files, layout: 'side', size: 'a4-portrait', marginMm: 10, cutLine: true })
check('三张票出两页', merged.stats.pages === 2, merged.stats)
check('统计里发票数正确', merged.stats.invoices === 3)
check('纸张数按双面折算', merged.stats.sheets === 1)
check('输出以 %PDF 开头', Buffer.from(merged.bytes.slice(0, 5)).toString('latin1') === '%PDF-')

const outDoc = await PDFDocument.load(merged.bytes)
const outSize = outDoc.getPage(0).getSize()
check('输出是 A4 纵向', Math.abs(outSize.width - A4P[0]) < 1 && Math.abs(outSize.height - A4P[1]) < 1)

/**
 * 数一页里嵌了几个 XObject。
 * @param {import('pdf-lib').PDFPage} page 页。
 * @returns {number} 数量。
 */
function countXObjects(page) {
  const resources = page.node.Resources()
  if (!resources) return 0
  const xobject = resources.lookup(resources.context.obj('XObject'))
  if (!xobject) return 0
  return xobject.keys().length
}
check('首页嵌两张发票', countXObjects(outDoc.getPage(0)) === 2, countXObjects(outDoc.getPage(0)))
check('末页嵌一张发票', countXObjects(outDoc.getPage(1)) === 1)

const stacked = await mergeInvoices({ files: files.slice(0, 2), layout: 'stack', size: 'a4-landscape', marginMm: 0, cutLine: false })
const stackedDoc = await PDFDocument.load(stacked.bytes)
const stackedSize = stackedDoc.getPage(0).getSize()
check('横向纸张生效', Math.abs(stackedSize.width - A4L[0]) < 1 && Math.abs(stackedSize.height - A4L[1]) < 1)
check('两张票一页', stacked.stats.pages === 1 && stacked.stats.invoices === 2)
check('上下版式仍嵌两张', countXObjects(stackedDoc.getPage(0)) === 2)

const rotated = await mergeInvoices({
  files: [{ name: 'r.pdf', data: (await fixture(A4P, 'Rotated', 90)).toString('base64') }],
  layout: 'side',
  size: 'a4-portrait',
})
check('带旋转的票也能合并', rotated.stats.pages === 1 && rotated.stats.invoices === 1)
const rotatedDoc = await PDFDocument.load(rotated.bytes)
check('旋转票单页可解析', rotatedDoc.getPageCount() === 1)

const single = await mergeInvoices({ files: [{ name: 'x.pdf', data: files[0].data }], layout: 'side' })
check('只传一张也出一页', single.stats.pages === 1 && single.stats.invoices === 1)

console.log('invoices: errors')

const expectError = async (label, input, pattern) => {
  let error = null
  try {
    await mergeInvoices(input)
  } catch (cause) {
    error = cause
  }
  check(label, error instanceof Error && pattern.test(error.message), error && error.message)
}

await expectError('空文件列表被拒', { files: [] }, /至少一份/)
await expectError('非 PDF 内容被拒', { files: [{ name: 'fake.pdf', data: Buffer.from('hello world').toString('base64') }] }, /不是 PDF/)
await expectError('伪造 PDF 头但内容损坏被拒', {
  files: [{ name: 'broken.pdf', data: Buffer.from('%PDF-1.7\nnot really a pdf').toString('base64') }],
}, /打不开|没有页面/)
await expectError('超过文件数上限被拒', { files: Array.from({ length: 61 }, () => files[0]) }, /最多/)

check('文件名带日期', /^invoice-merged-\d{8}-\d{4}\.pdf$/.test(downloadFileName()), downloadFileName())
check('纸张名回落 A4', pageSizeOf('nope')[0] === A4P[0])

const autoPortrait = await mergeInvoices({ files, layout: 'auto', size: 'a4-portrait' })
check('auto 在竖版发票多时选左右', autoPortrait.stats.layout === 'side' && autoPortrait.stats.autoPicked === true, autoPortrait.stats)

const autoLandscape = await mergeInvoices({ files: files.slice(1, 2), layout: 'auto', size: 'a4-portrait' })
check('auto 在只有横版发票时选上下', autoLandscape.stats.layout === 'stack', autoLandscape.stats)

const fakeItems = [
  { size: () => ({ width: 842, height: 595 }) },
  { size: () => ({ width: 842, height: 595 }) },
  { size: () => ({ width: 595, height: 842 }) },
]
check('inferLayout 按多数取向', inferLayout(fakeItems) === 'stack')

const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-inv-')), 'merged.pdf')
fs.writeFileSync(outFile, merged.bytes)
console.log(`\n${passed} 项通过（样例：${outFile}，${merged.bytes.length} 字节）`)

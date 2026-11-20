/**
 * 发票合并：把若干 PDF 发票按「每张 A4 放两张」拼成一份可双面打印的文件。
 *
 * 版式约定：
 *  · side  左右两张：左 / 右各一张发票，适合竖版电子发票；
 *  · stack 上下两张：上 / 下各一张，适合横版电子发票。
 * 双面打印的配对由打印机负责（长边翻页），文件本身只保证
 * 「每一面恰好两张发票、顺序即上传顺序」。
 */

import { PDFDocument, rgb } from 'pdf-lib'

/** 纸张尺寸（pt）。 */
export const PAGE_SIZES = {
  'a4-portrait': [595.276, 841.89],
  'a4-landscape': [841.89, 595.276],
}

/** 支持的版式；auto 按发票长宽比自动选。 */
export const LAYOUTS = ['auto', 'side', 'stack']

/** 单文件与总量的上限（字节）。 */
export const LIMITS = {
  files: 60,
  fileBytes: 25 * 1024 * 1024,
  totalBytes: 80 * 1024 * 1024,
}

const MM_TO_PT = 72 / 25.4

/**
 * 取纸张尺寸，未知名称回落到 A4 纵向。
 * @param {string} name 名称。
 * @returns {number[]} [宽, 高]（pt）。
 */
export function pageSizeOf(name) {
  return PAGE_SIZES[name] || PAGE_SIZES['a4-portrait']
}

/**
 * 计算两个发票位的可用矩形（尚未扣内边距）。
 * @param {{ pageW: number, pageH: number, marginPt: number, gutterPt?: number, layout?: string }} options 参数。
 * @returns {{ slots: Array<{x: number, y: number, width: number, height: number}>, cut: { axis: 'v' | 'h', at: number } }} 槽位与裁切线位置。
 */
export function computeSlots(options) {
  const pageW = options.pageW
  const pageH = options.pageH
  const margin = Math.max(0, options.marginPt)
  const gutter = Math.max(0, options.gutterPt || 0)
  const layout = options.layout === 'stack' ? 'stack' : 'side'
  if (layout === 'side') {
    const slotW = Math.max(1, (pageW - margin * 2 - gutter) / 2)
    const slotH = Math.max(1, pageH - margin * 2)
    return {
      slots: [
        { x: margin, y: margin, width: slotW, height: slotH },
        { x: margin + slotW + gutter, y: margin, width: slotW, height: slotH },
      ],
      cut: { axis: 'v', at: margin + slotW + gutter / 2 },
    }
  }
  const slotW = Math.max(1, pageW - margin * 2)
  const slotH = Math.max(1, (pageH - margin * 2 - gutter) / 2)
  return {
    slots: [
      { x: margin, y: margin + slotH + gutter, width: slotW, height: slotH },
      { x: margin, y: margin, width: slotW, height: slotH },
    ],
    cut: { axis: 'h', at: margin + slotH + gutter / 2 },
  }
}

/**
 * 给槽位留出内边距。
 * @param {{ x: number, y: number, width: number, height: number }} slot 槽位。
 * @param {number} pad 内边距（pt）。
 * @returns {{ x: number, y: number, width: number, height: number }} 收缩后的槽位。
 */
export function padSlot(slot, pad) {
  const amount = Math.max(0, pad)
  return {
    x: slot.x + amount,
    y: slot.y + amount,
    width: Math.max(1, slot.width - amount * 2),
    height: Math.max(1, slot.height - amount * 2),
  }
}

/**
 * 把一页发票等比放进槽位并居中。
 * @param {{ x: number, y: number, width: number, height: number }} slot 槽位。
 * @param {{ width: number, height: number }} source 发票尺寸。
 * @returns {{ x: number, y: number, width: number, height: number }} 绘制矩形。
 */
export function fitIntoSlot(slot, source) {
  const width = Math.max(1, source.width)
  const height = Math.max(1, source.height)
  const scale = Math.min(slot.width / width, slot.height / height)
  const drawW = width * scale
  const drawH = height * scale
  return {
    x: slot.x + (slot.width - drawW) / 2,
    y: slot.y + (slot.height - drawH) / 2,
    width: drawW,
    height: drawH,
  }
}

/**
 * 按发票长宽比推断版式：横版多于竖版就上下排。
 * @param {Array<{ size: () => { width: number, height: number } }>} items 已嵌入的发票。
 * @returns {string} 'side' 或 'stack'。
 */
export function inferLayout(items) {
  let landscape = 0
  let portrait = 0
  for (const item of items) {
    const size = item.size()
    if (size.width > size.height) landscape += 1
    else portrait += 1
  }
  return landscape > portrait ? 'stack' : 'side'
}

/**
 * 在两张发票之间画一条虚线裁切参考线。
 * @param {import('pdf-lib').PDFPage} page 输出页。
 * @param {{ pageW: number, pageH: number, marginPt: number }} page 参数。
 * @param {{ axis: 'v' | 'h', at: number }} cut 裁切线。
 */
function drawCutLine(page, options, cut) {
  const color = rgb(0.76, 0.76, 0.79)
  const margin = Math.max(0, options.marginPt)
  if (cut.axis === 'h') {
    page.drawLine({
      start: { x: margin, y: cut.at },
      end: { x: options.pageW - margin, y: cut.at },
      thickness: 0.5,
      color,
      dashArray: [4, 4],
    })
    return
  }
  page.drawLine({
    start: { x: cut.at, y: margin },
    end: { x: cut.at, y: options.pageH - margin },
    thickness: 0.5,
    color,
    dashArray: [4, 4],
  })
}

/**
 * 解析一份 base64 PDF。
 * @param {string} base64 内容。
 * @returns {Uint8Array} 字节。
 */
export function decodeBase64(base64) {
  const clean = String(base64 || '').replace(/^data:application\/pdf[^,]*,/i, '').replace(/\s+/g, '')
  const buffer = Buffer.from(clean, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

/**
 * 合并发票。
 * @param {{ files: Array<{ name?: string, data?: string, bytes?: Uint8Array }>, layout?: string, size?: string, marginMm?: number, cutLine?: boolean }} input 请求参数。
 * @returns {Promise<{ bytes: Uint8Array, stats: object }>} 结果与统计。
 */
export async function mergeInvoices(input) {
  const files = Array.isArray(input?.files) ? input.files : []
  if (files.length === 0) throw new Error('请先选择至少一份 PDF 发票')
  if (files.length > LIMITS.files) throw new Error(`一次最多合并 ${LIMITS.files} 份文件`)

  const [pageW, pageH] = pageSizeOf(input?.size)
  const requestedLayout = LAYOUTS.includes(input?.layout) ? input.layout : 'auto'
  const marginMm = Math.min(30, Math.max(0, Number(input?.marginMm) || 0))
  const marginPt = Math.round(marginMm * MM_TO_PT * 100) / 100
  const innerPadPt = marginPt > 0 ? 2 : 6

  const out = await PDFDocument.create()
  out.setTitle('办公魔盒 · 发票合并')
  out.setCreator('办公魔盒')
  out.setProducer('办公魔盒 (pdf-lib)')

  const embedded = []
  let totalBytes = 0
  for (const [index, file] of files.entries()) {
    const name = String(file?.name || `第 ${index + 1} 份`).slice(0, 120)
    const bytes = file && file.bytes ? new Uint8Array(file.bytes) : decodeBase64(file?.data)
    if (bytes.byteLength === 0) throw new Error(`「${name}」是空文件`)
    if (bytes.byteLength > LIMITS.fileBytes) throw new Error(`「${name}」超过 ${Math.round(LIMITS.fileBytes / 1024 / 1024)}MB`)
    totalBytes += bytes.byteLength
    if (totalBytes > LIMITS.totalBytes) throw new Error(`文件总量超过 ${Math.round(LIMITS.totalBytes / 1024 / 1024)}MB，请分批合并`)
    const header = Buffer.from(bytes.slice(0, 5)).toString('latin1')
    if (!header.startsWith('%PDF-')) throw new Error(`「${name}」看起来不是 PDF 文件`)

    let pages
    try {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
      if (source.getPageCount() === 0) throw new Error('文件里没有页面')
      pages = await out.embedPdf(source, source.getPageIndices())
    } catch (error) {
      throw new Error(`「${name}」打不开（可能加密或损坏）：${error.message}`)
    }
    for (const page of pages) embedded.push(page)
  }

  // auto：横版发票多就上下排，竖版发票多就左右排，两种都能把纸用满。
  const layout = requestedLayout === 'auto' ? inferLayout(embedded) : requestedLayout
  const { slots, cut } = computeSlots({ pageW, pageH, marginPt, gutterPt: 0, layout })
  for (let index = 0; index < embedded.length; index += 2) {
    const page = out.addPage([pageW, pageH])
    const pair = [embedded[index], embedded[index + 1]].filter(Boolean)
    pair.forEach((item, slotIndex) => {
      const rect = fitIntoSlot(padSlot(slots[slotIndex], innerPadPt), item.size())
      page.drawPage(item, rect)
    })
    if (input?.cutLine !== false) drawCutLine(page, { pageW, pageH, marginPt }, cut)
  }

  // 末页只有一张票时，空位画一个虚线框（语言无关），让人一眼看出那是预留位。
  if (embedded.length % 2 === 1) {
    const slot = padSlot(slots[1], innerPadPt)
    out.getPage(out.getPageCount() - 1).drawRectangle({
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      borderColor: rgb(0.86, 0.86, 0.88),
      borderWidth: 0.8,
      borderDashArray: [5, 5],
    })
  }

  const bytes = await out.save()
  const pages = out.getPageCount()
  return {
    bytes,
    stats: {
      files: files.length,
      invoices: embedded.length,
      pages,
      sheets: Math.ceil(pages / 2),
      size: PAGE_SIZES[input?.size] ? input.size : 'a4-portrait',
      layout,
      autoPicked: requestedLayout === 'auto',
      marginMm,
    },
  }
}

/**
 * 生成下载用的文件名。
 * @returns {string} 形如 发票合并-20261120-2109.pdf。
 */
export function downloadFileName() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `invoice-merged-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.pdf`
}

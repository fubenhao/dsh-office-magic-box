/**
 * 布局自检图：把 computeSlots/fitIntoSlot 算出的矩形画成 SVG 再转 PNG，
 * 用来肉眼确认「一张 A4 两面各两张」的几何关系（与 PDF 里用的是同一套函数）。
 * 用法：node dev/render-layout-preview.mjs [out.png]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { computeSlots, fitIntoSlot, padSlot, pageSizeOf } from '../lib/invoices.js'

const require = createRequire('D:/dsh/resources/app/dsh/node_modules/')
const sharp = require('sharp')

const A4 = pageSizeOf('a4-portrait')
const marginPt = Math.round(10 * (72 / 25.4) * 100) / 100

/**
 * 生成一块面板的 SVG。
 * @param {{ x: number, y: number, w: number, h: number }} box 画布区域。
 * @param {string} layout 版式。
 * @param {Array<{width: number, height: number}>} invoices 两张发票尺寸。
 * @param {string} title 标题。
 * @returns {string} SVG 片段。
 */
function panel(box, layout, invoices, title) {
  const scale = Math.min(box.w / A4[0], box.h / A4[1])
  const pageW = A4[0] * scale
  const pageH = A4[1] * scale
  const ox = box.x + (box.w - pageW) / 2
  const oy = box.y + (box.h - pageH) / 2
  const toX = value => ox + value * scale
  const toY = value => oy + (A4[1] - value) * scale
  const { slots, cut } = computeSlots({ pageW: A4[0], pageH: A4[1], marginPt, gutterPt: 0, layout })
  const parts = []
  parts.push(`<text x="${ox}" y="${oy - 14}" font-family="Segoe UI, sans-serif" font-size="15" fill="#3f3f46">${title}</text>`)
  parts.push(`<rect x="${ox}" y="${oy}" width="${pageW}" height="${pageH}" fill="#ffffff" stroke="#d4d4d8" stroke-width="1.2"/>`)
  const padded = slots.map(slot => padSlot(slot, 6))
  padded.forEach((slot, index) => {
    parts.push(`<rect x="${toX(slot.x)}" y="${toY(slot.y + slot.height)}" width="${slot.width * scale}" height="${slot.height * scale}" fill="#f4f4f5" stroke="#e4e4e7" stroke-dasharray="3 3"/>`)
    const invoice = invoices[index % invoices.length]
    const rect = fitIntoSlot(slot, invoice)
    parts.push(`<rect x="${toX(rect.x)}" y="${toY(rect.y + rect.height)}" width="${rect.width * scale}" height="${rect.height * scale}" fill="#eff6ff" stroke="#2563eb" stroke-width="1"/>`)
    parts.push(`<text x="${toX(rect.x) + 8}" y="${toY(rect.y + rect.height) + 16}" font-family="Consolas, monospace" font-size="11" fill="#1d4ed8">#${index + 1} ${Math.round(invoice.width)}x${Math.round(invoice.height)}pt</text>`)
  })
  if (cut.axis === 'v') {
    parts.push(`<line x1="${toX(cut.at)}" y1="${oy}" x2="${toX(cut.at)}" y2="${oy + pageH}" stroke="#a1a1aa" stroke-dasharray="5 4" stroke-width="0.9"/>`)
  } else {
    parts.push(`<line x1="${ox}" y1="${toY(cut.at)}" x2="${ox + pageW}" y2="${toY(cut.at)}" stroke="#a1a1aa" stroke-dasharray="5 4" stroke-width="0.9"/>`)
  }
  parts.push(`<text x="${ox}" y="${oy + pageH + 20}" font-family="Consolas, monospace" font-size="11" fill="#71717a">A4 ${Math.round(A4[0])}x${Math.round(A4[1])}pt · margin ${marginPt}pt · cut ${cut.axis}</text>`)
  return parts.join('')
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="560" viewBox="0 0 980 560">
  <rect width="980" height="560" fill="#ffffff"/>
  ${panel({ x: 30, y: 40, w: 400, h: 480 }, 'side', [{ width: 595.276, height: 841.89 }, { width: 595.276, height: 841.89 }], 'side: two portrait invoices per page (front)')}
  ${panel({ x: 520, y: 40, w: 430, h: 480 }, 'stack', [{ width: 841.89, height: 595.276 }, { width: 841.89, height: 595.276 }], 'stack: two landscape invoices per page (back)')}
</svg>`

const target = process.argv[2] || path.join(os.tmpdir(), 'omb-layout-preview.png')
await sharp(Buffer.from(svg)).png().toFile(target)
console.log('layout preview:', target, fs.statSync(target).size, 'bytes')

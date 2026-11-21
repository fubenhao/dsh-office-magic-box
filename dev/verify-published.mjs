/**
 * 发布后自检：registry 上有这个版本吗、jsDelivr 上的索引能不能取到并解析、图标是否可访问。
 * 用法：node dev/verify-published.mjs [版本号，缺省取 package.json]
 * 说明：本机到 jsDelivr 可能被网络挡住；脚本会区分「URL 有问题」与「本机连不上」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = process.argv[2] || pkg.version
const name = pkg.name

const marketIndex = await import('file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js')

let failures = 0
const ok = message => console.log(`✓ ${message}`)
const bad = message => {
  failures += 1
  console.log(`✗ ${message}`)
}

/**
 * 取一个 URL，区分 HTTP 状态与网络错误。
 * @param {string} url 地址。
 * @param {number} timeoutMs 超时。
 * @returns {Promise<{ status: number, body?: string, networkError?: string }>} 结果。
 */
async function fetchUrl(url, timeoutMs = 20000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const body = response.ok ? await response.text() : undefined
    return { status: response.status, body }
  } catch (error) {
    return { status: 0, networkError: String(error?.cause?.code || error?.message || error) }
  }
}

console.log(`检查 ${name}@${version}\n`)

const registry = await fetchUrl(`https://registry.npmjs.org/${name}`)
if (registry.status === 0) bad(`registry 连不上（${registry.networkError}）——先确认网络/镜像`)
else if (registry.status === 404) bad('registry 上还没有这个包（尚未发布，或名字不同）')
else if (registry.status === 200) {
  const meta = JSON.parse(registry.body)
  if (meta.versions && meta.versions[version]) ok(`registry 有 ${version}（latest: ${meta['dist-tags']?.latest}）`)
  else bad(`registry 上没有 ${version}（latest: ${meta['dist-tags']?.latest}）`)
}

const indexUrl = `https://cdn.jsdelivr.net/npm/${name}/market/index.json`
const cdn = await fetchUrl(indexUrl, 25000)
if (cdn.status === 0) console.log(`… jsDelivr 本机连不上（${cdn.networkError}），跳过索引检查；换网络或代理后可重跑`)
else if (cdn.status !== 200) bad(`jsDelivr 索引返回 ${cdn.status}：${indexUrl}`)
else {
  try {
    const parsed = marketIndex.parseMarketIndex(JSON.parse(cdn.body), indexUrl)
    const plugin = parsed.plugins[0]
    ok(`jsDelivr 索引可解析：${plugin.name} v${plugin.versions[0].version} · author ${plugin.author}`)
    if (plugin.versions[0].version !== version) bad(`索引里的版本 ${plugin.versions[0].version} 与期望 ${version} 不一致（重新发版后忘了重新生成索引？）`)
    const icon = await fetchUrl(plugin.icon, 20000)
    if (icon.status === 0) console.log(`… 图标本机连不上（${icon.networkError}）
` + `  ${plugin.icon}`)
    else if (icon.status === 200) ok(`索引图标可访问：${plugin.icon}`)
    else bad(`索引图标返回 ${icon.status}：${plugin.icon}`)
    console.log(`\n市场地址（填进「插件 → 发现 → 添加索引」）：\n  ${indexUrl}`)
  } catch (error) {
    bad(`索引解析失败：${error.message}`)
  }
}

console.log(failures === 0 ? '\n全部通过。' : `\n${failures} 项未通过。`)
process.exit(failures === 0 ? 0 : 1)

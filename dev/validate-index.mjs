/**
 * 校验市场索引：读市场里那份真实文件，按三种基址解析（本地、jsDelivr 最新版、jsDelivr 钉版本）。
 * 用法：node dev/validate-index.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mod = await import('file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js')

const index = JSON.parse(fs.readFileSync(path.join(root, 'market/index.json'), 'utf8'))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const bases = [
  'http://127.0.0.1:8899/index.json',
  `https://cdn.jsdelivr.net/npm/${pkg.name}/market/index.json`,
  `https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}/market/index.json`,
]

let failures = 0
for (const url of bases) {
  try {
    const parsed = mod.parseMarketIndex(index, url)
    const plugin = parsed.plugins[0]
    const spec = mod.marketInstallTarget(plugin.name, plugin.versions[0]).spec
    console.log(`✓ ${url}`)
    console.log(`   title: ${parsed.title.zh} | plugin: ${plugin.name} v${plugin.versions[0].version} | author: ${plugin.author}`)
    console.log(`   icon: ${plugin.icon} | spec: ${spec}`)
  } catch (error) {
    failures += 1
    console.log(`✗ ${url} → ${error.path} ${error.reason}`)
  }
}

// 索引里的名字/版本必须与包自身一致，否则市场装到的是别的版本。
const plugin = index.plugins[0]
const drift = []
if (plugin.name !== pkg.name) drift.push(`name: 索引 ${plugin.name} ≠ 包 ${pkg.name}`)
if (plugin.versions[0].version !== pkg.version) drift.push(`version: 索引 ${plugin.versions[0].version} ≠ 包 ${pkg.version}`)
if (plugin.author !== (typeof pkg.author === 'string' ? pkg.author : pkg.author.name)) drift.push(`author: 索引 ${plugin.author} ≠ 包 ${pkg.author.name}`)
if (drift.length > 0) {
  failures += 1
  console.log(`✗ 索引与 package.json 不一致：\n   ${drift.join('\n   ')}`)
  console.log('   修正：node dev/make-market.mjs')
} else {
  console.log('✓ 索引与 package.json 一致（name / version / author）')
}

process.exit(failures === 0 ? 0 : 1)

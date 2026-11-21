/**
 * 生成「git 源」市场索引：不依赖 npm，别人可从 GitHub 直接安装。
 * 用法：node dev/make-index-git.mjs            （取当前 HEAD 的 40 位 commit）
 *      node dev/make-index-git.mjs <sha>       （指定某个 commit）
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

const commit = (process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).trim()
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`commit 必须是 40 位小写十六进制：${commit}`)

const pkg = read('package.json')
const zh = read('locale/zh.json').meta
const en = read('locale/en.json').meta

const index = {
  format: 1,
  title: { zh: 'FBH 的 DSH 插件', en: "FBH's DSH plugins" },
  description: { zh: '办公小工具：启动中控台、发票合并。', en: 'Small office tools: launch console and invoice merge.' },
  metadata: {
    categories: { office: { title: { zh: '办公', en: 'Office' } } },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { zh: zh.title, en: en.title },
      description: { zh: zh.description, en: en.description },
      icon: 'icon.svg',
      author: pkg.author.name,
      // 索引放在仓库里、走 GitHub 托管，所以 homepage 指仓库本身是安全的
      homepage: 'https://github.com/fubenhao/dsh-office-magic-box',
      repository: { url: 'https://github.com/fubenhao/dsh-office-magic-box' },
      metadata: {
        category: 'office',
        keywords: ['invoice', 'pdf', 'launcher', 'office'],
        labels: [],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: {
            type: 'git',
            url: 'https://github.com/fubenhao/dsh-office-magic-box',
            commit,
          },
          engines: { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

const body = `${JSON.stringify(index, null, 2)}\n`
for (const target of ['market/index-git.json', 'dev/market/index-git.json']) {
  fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true })
  fs.writeFileSync(path.join(root, target), body, 'utf8')
}
console.log('git-source index written | commit:', commit, '| version:', pkg.version)

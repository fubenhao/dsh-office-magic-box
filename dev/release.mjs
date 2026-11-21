/**
 * 发版前的一步到位：重新生成两份市场索引 → 校验 → 跑全部测试 → 打包。
 * 用法：node dev/release.mjs
 * 之后手动执行它打印的 npm publish 命令（需要你先 npm login）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
// Windows 下 .cmd 需要经 cmd.exe 调用；其它平台直接执行 npm
const npmRun = args => (process.platform === 'win32'
  ? ['cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')]]
  : ['npm', args])

/**
 * 跑一条命令并把输出接到当前终端。
 * @param {string} command 命令。
 * @param {string[]} args 参数。
 * @param {string} label 步骤名。
 */
function run(command, args, label) {
  process.stdout.write(`\n▶ ${label}\n`)
  try {
    execFileSync(command, args, { cwd: root, stdio: 'inherit' })
  } catch (error) {
    console.error(`\n✗ 失败于「${label}」（exit ${error.status ?? 'unknown'}）`)
    process.exit(1)
  }
}

const steps = [
  ['node', ['dev/make-market.mjs'], '生成 npm 源索引'],
  ['node', ['dev/make-index-git.mjs'], '生成 git 源索引（兜底，钉当前 HEAD）'],
  ['node', ['dev/validate-index.mjs'], '校验索引（三种基址 + 与 package.json 是否漂移）'],
  ['node', ['dev/host-test.mjs'], 'Host 测试'],
  ['node', ['dev/invoices-test.mjs'], '合并测试'],
  ['node', ['dev/render-smoke.mjs'], '渲染结构测试'],
]

for (const [command, args, label] of steps) run(command, args, label)

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.tgz'))) {
  fs.rmSync(path.join(root, file))
}
run(...npmRun(['pack']), '打包')

const tarball = `dsh-office-magic-box-${pkg.version}.tgz`
const size = fs.statSync(path.join(root, tarball)).size

console.log(`\n✓ ${pkg.name} v${pkg.version} 已打包：${tarball}（${(size / 1024).toFixed(1)} kB）`)
console.log('\n接下来两步需要你的 npm 账号：\n')
console.log('  npm login --registry=https://registry.npmjs.org')
console.log(`  npm publish ./${tarball} --access public --registry=https://registry.npmjs.org\n`)
console.log('发布后自检：node dev/verify-published.mjs\n')
console.log('市场索引地址（钉版本，可直接验证）：')
console.log(`  https://unpkg.com/${pkg.name}@${pkg.version}/market/index.json`)
console.log(`  https://cdn.jsdelivr.net/npm/${pkg.name}/market/index.json`)

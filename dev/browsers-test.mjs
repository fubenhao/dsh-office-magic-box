/**
 * 浏览器目录与启动计划测试（纯函数，不真的拉起进程）。
 * 用法：node dev/browsers-test.mjs
 */
import assert from 'node:assert/strict'
import { browserCatalog, resolveLaunchPlan, BROWSER_IDS } from '../lib/browsers.js'

let passed = 0
const check = (label, condition, extra) => {
  assert.ok(condition, `${label}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

const URL = 'https://oa.example.com/login'

console.log('browsers: catalog')

const winExists = new Set(['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])
const winCatalog = browserCatalog({
  platform: 'win32',
  exists: value => winExists.has(value),
})
check('目录含六个选项', winCatalog.length === 6, winCatalog.map(item => item.id))
check('system 总是可用', winCatalog.find(item => item.id === 'system').available === true)
const chromeWin = winCatalog.find(item => item.id === 'chrome')
check('装了的 Chrome 被识别', chromeWin.available === true && chromeWin.path.endsWith('chrome.exe'), chromeWin)
check('没装的 Edge 标为不可用', winCatalog.find(item => item.id === 'edge').available === false)
check('自定义选项始终可选', winCatalog.find(item => item.id === 'custom').available === true)
check('目录顺序与 BROWSER_IDS 一致', winCatalog.map(item => item.id).join(',') === BROWSER_IDS.join(','), winCatalog.map(item => item.id))

const macCatalog = browserCatalog({ platform: 'darwin', exists: () => true })
check('macOS 路径也能识别', macCatalog.find(item => item.id === 'chrome').path.includes('Google Chrome.app'))

const linuxCatalog = browserCatalog({ platform: 'linux', exists: () => false })
check('Linux 裸命令不查文件', linuxCatalog.find(item => item.id === 'firefox').available === true)

console.log('browsers: launch plan')

const systemWin = resolveLaunchPlan({ browserId: 'system', url: URL, platform: 'win32' })
check('Windows 默认浏览器走 cmd start', systemWin.command === 'cmd.exe' && systemWin.args.join(' ').includes('start'), systemWin)
check('URL 被包进引号', systemWin.args[systemWin.args.length - 1].includes(`"${URL}"`), systemWin.args)

const systemMac = resolveLaunchPlan({ browserId: 'system', url: URL, platform: 'darwin' })
check('macOS 默认走 open', systemMac.command === 'open' && systemMac.args[0] === URL)
const systemLinux = resolveLaunchPlan({ browserId: 'system', url: URL, platform: 'linux' })
check('Linux 默认走 xdg-open', systemLinux.command === 'xdg-open')

const chromePlan = resolveLaunchPlan({
  browserId: 'chrome',
  url: URL,
  platform: 'win32',
  exists: value => winExists.has(value),
})
check('Chrome 直接用可执行文件', chromePlan.command.endsWith('chrome.exe') && chromePlan.args[0] === URL, chromePlan)
check('计划带 label', chromePlan.label === 'chrome')

const customPlan = resolveLaunchPlan({
  browserId: 'custom',
  url: URL,
  customPath: 'D:\\browsers\\custom.exe',
  platform: 'win32',
  exists: () => true,
})
check('自定义浏览器用给定路径', customPlan.command === 'D:\\browsers\\custom.exe')

const fallback = resolveLaunchPlan({ browserId: 'nope', url: URL, platform: 'win32' })
check('未知浏览器回落系统默认', fallback.label === 'system')

const expectThrow = (label, request, pattern) => {
  let error = null
  try {
    resolveLaunchPlan(request)
  } catch (cause) {
    error = cause
  }
  check(label, error instanceof Error && pattern.test(error.message), error && error.message)
}

expectThrow('非 http(s) 被拒', { browserId: 'system', url: 'file:///etc/passwd', platform: 'win32' }, /http/)
expectThrow('没装的目标浏览器给出明确错误', {
  browserId: 'edge',
  url: URL,
  platform: 'win32',
  exists: () => false,
}, /没找到 edge/)
expectThrow('自定义路径为空被拒', { browserId: 'custom', url: URL, platform: 'win32' }, /程序路径/)
expectThrow('自定义路径不存在被拒', {
  browserId: 'custom',
  url: URL,
  customPath: 'D:\\nope\\x.exe',
  platform: 'win32',
  exists: () => false,
}, /不存在/)

console.log(`\n${passed} 项通过`)

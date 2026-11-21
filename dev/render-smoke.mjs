/**
 * 渲染结构冒烟测试：用最小 React 桩真正调用各视图组件，断言树形结构与关键类名。
 * 不碰浏览器、不渲染像素，只验证「谁挂在谁下面」「按钮类别对不对」。
 * 用法：node dev/render-smoke.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const bodyStart = source.indexOf('factory(require) {') + 'factory(require) {'.length
const returnAt = source.lastIndexOf("    return {\n      inject: ['slots', 'locale'],")
if (bodyStart < 0 || returnAt < 0) throw new Error('factory body markers not found')
const body = `${source.slice(bodyStart, returnAt)}\nreturn { Btn, Field, Crumb, BookmarkRow, BookmarksView, HomeView, InvoicesView, LauncherView, SettingsView, ServiceRow, SceneCard, App }\n`

const stubReact = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false)
    if (typeof type === 'function') return type(Object.assign({}, props, { children: flat }))
    return { type, props: props || {}, children: flat }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useRef(value) {
    return { current: value }
  },
  useEffect() {},
  useCallback(fn) {
    return fn
  },
  useMemo(fn) {
    return fn()
  },
}

const stubDocument = { baseURI: 'http://127.0.0.1:57748/', body: { appendChild() {}, removeChild() {} }, createElement: () => ({ click() {} }) }
const factory = new Function('require', 'document', body)
const views = factory(() => stubReact, stubDocument)

/**
 * 深度遍历元素树。
 * @param {any} node 节点。
 * @param {(node: any) => void} visit 访问器。
 */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

/**
 * 收集某个类名对应的元素。
 * @param {any} tree 树。
 * @param {string} className 类名。
 * @returns {any[]} 命中元素。
 */
function byClass(tree, className) {
  const hits = []
  walk(tree, node => {
    if (typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes(className)) hits.push(node)
  })
  return hits
}

/**
 * 收集某段文本节点。
 * @param {any} tree 树。
 * @param {string} text 文本。
 * @returns {boolean} 是否存在。
 */
function hasText(tree, text) {
  let found = false
  walk(tree, node => {
    for (const child of node.children || []) {
      if (child === text) found = true
      if (child && typeof child === 'object' && child.type === 'code' && child.children.includes(text)) found = true
    }
  })
  return found
}

const t = key => key
const noop = () => {}
let passed = 0
const check = (label, condition, extra) => {
  assert.ok(condition, `${label}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

const service = {
  id: 's1',
  name: 'nacos',
  group: '默认分组',
  command: 'start.lnk',
  cwd: 'D:\\Nacos',
  openUrl: '',
  status: 'stopped',
  startedAt: null,
  endedAt: null,
  exitCode: null,
  error: '',
  log: '',
  logTruncated: false,
}

console.log('office-magic-box render smoke')

/* —— 外壳与主页 —— */
const app = views.App({ t, pickDirectory: async () => ({ ok: true, path: null }) })
check('外壳是 omb-page + omb-shell', app.props.className === 'omb-page' && byClass(app, 'omb-shell').length === 1)
check('默认停在主页', byClass(app, 'omb-title')[0].children[0] === 'title', byClass(app, 'omb-title')[0].children)
check('主页有三张功能卡', byClass(app, 'omb-fcard').length === 3, byClass(app, 'omb-fcard').length)
check('功能卡是按钮元素', byClass(app, 'omb-fcard').every(card => card.type === 'button'))
check('卡片带图标与箭头', byClass(app, 'omb-fcard-icon').length === 3 && byClass(app, 'omb-fcard-arrow').length === 3, [byClass(app, 'omb-fcard-icon').length, byClass(app, 'omb-fcard-arrow').length])
check('主页有页脚', byClass(app, 'omb-foot').length === 1)

const homeVersioned = views.HomeView({ t, version: '1.2.0', onOpen: noop })
check('主页显示版本号', byClass(homeVersioned, 'omb-ver').length === 2, byClass(homeVersioned, 'omb-ver').map(chip => chip.children[0]))
check('主页有设置入口', byClass(homeVersioned, 'omb-btn').some(button => button.children[0] === 'settings'))

const config = {
  version: '1.2.0',
  author: 'FBH · Forever Be Home',
  license: 'MIT',
  plugin: { name: '@local/office-magic-box', version: '1.2.0', author: 'FBH · Forever Be Home', license: 'MIT', dir: 'D:\\\\work\\\\office-magic-box' },
  settings: {
    stateFile: 'D:\\data\\state.json',
    openDir: 'D:\\invoices',
    downloadDir: 'D:\\exports',
    defaults: { stateFile: 'C:\\Users\\x\\.dsh\\office-magic-box\\state.json', openDir: 'D:\\Documents', downloadDir: 'D:\\Downloads' },
    custom: { stateFile: true, openDir: true, downloadDir: true },
  },
}
const settingsView = views.SettingsView({ t, config, onBack: noop, pickDirectory: async () => ({ ok: true, path: 'D:\\x' }), onSaved: noop })
check('设置页有标题与版本', byClass(settingsView, 'omb-title')[0].children[0] === 'settingsTitle' && byClass(settingsView, 'omb-ver').length === 1)
check('设置页三个分区（启动/发票/关于）', byClass(settingsView, 'omb-section-block').length === 3, byClass(settingsView, 'omb-section-block').length)
const aboutRows = byClass(settingsView, 'omb-kv')[0]
check('关于区展示作者等信息', Boolean(aboutRows) && aboutRows.children.filter(child => child && child.type === 'dt').length === 5, aboutRows && aboutRows.children.length)
check('关于区作者取 config.author', JSON.stringify(aboutRows).includes('FBH · Forever Be Home'))
check('关于区有署名词', JSON.stringify(byClass(settingsView, 'omb-section-block')[2]).includes('signature'), byClass(settingsView, 'omb-note').map(node => node.children[0]))
check('设置页三个路径输入', byClass(settingsView, 'omb-input').length === 3, byClass(settingsView, 'omb-input').length)
check('设置页有保存与恢复默认', byClass(settingsView, 'omb-btn').some(button => button.children[0] === 'save') && byClass(settingsView, 'omb-btn').some(button => button.children[0] === 'useDefault'))

const home = views.HomeView({ t, onOpen: noop })
check('主页标题与副标题', byClass(home, 'omb-title').length === 1 && byClass(home, 'omb-subtitle').length === 1)
const metas = byClass(home, 'omb-fcard-meta')
check('启动卡显示统计占位', metas[0].children[0] === 'loading', metas[0].children)

/* —— 启动中控台 —— */
const launcher = views.LauncherView({ t, pickDirectory: async () => ({ ok: true, path: null }), onBack: noop })
check('中控台有面包屑返回', byClass(launcher, 'omb-crumb').length === 1 && byClass(launcher, 'omb-crumb')[0].children.length === 3)
check('中控台标题是 launcherTitle', byClass(launcher, 'omb-title')[0].children[0] === 'launcherTitle')
check('两栏标题行各有一处（源码级）', (source.match(/className: 'omb-section-head'/g) || []).length === 2)
check('无数据时走加载态', byClass(launcher, 'omb-muted').length >= 1)
check('头部有刷新按钮', byClass(launcher, 'omb-head-actions').length === 1)

const rowProps = {
  t,
  service,
  locked: false,
  logOpen: false,
  onStart: noop,
  onStop: noop,
  onRestart: noop,
  onEdit: noop,
  onDelete: noop,
  onOpen: noop,
  onToggleLog: noop,
}
const row = views.ServiceRow(rowProps)
check('服务卡片根节点是 omb-card', row.props.className === 'omb-card')
check('操作区嵌在标题行内', byClass(row, 'omb-card-title')[0].children.some(child => child === byClass(row, 'omb-card-actions')[0]))
check('命令与目录都是等宽块', byClass(row, 'omb-mono').length === 2)
check('启动实心、删除红字', byClass(row, 'omb-btn--solid').length === 1 && byClass(row, 'omb-btn--danger').length === 1)
check('删除不带描边类', !byClass(row, 'omb-btn--danger')[0].props.className.includes('outline'))

const runningRow = views.ServiceRow(Object.assign({}, rowProps, {
  service: Object.assign({}, service, { status: 'running', startedAt: Date.now() }),
}))
check('运行中显示停止（浅红底）', byClass(runningRow, 'omb-btn--soft').length === 1)

const logRow = views.ServiceRow(Object.assign({}, rowProps, {
  logOpen: true,
  service: Object.assign({}, service, { log: 'hello', logTruncated: true }),
}))
check('展开输出有日志块与截断提示', byClass(logRow, 'omb-log').length === 1 && byClass(logRow, 'omb-note').length === 1)

const scene = { id: 'sc1', name: 'morning', stopOnError: true, steps: [{ serviceId: 's1', delayMs: 800 }, { serviceId: 's2', delayMs: 1000 }] }
const services = [service, Object.assign({}, service, { id: 's2', name: 'Sentinel', cwd: 'D:\\Sentinel', command: 'start.bat' })]
const cardProps = { t, scene, services, run: null, busy: false, onRun: noop, onStop: noop, onEdit: noop, onDelete: noop }
const card = views.SceneCard(cardProps)
check('场景卡标题行含操作区', byClass(card, 'omb-card-title')[0].children.some(child => byClass({ children: [child] }, 'omb-card-actions').length === 1))
check('步骤用箭头链', byClass(card, 'omb-arrow').length === 1 && byClass(card, 'omb-step').length === 2)
check('场景按钮分类正确', byClass(card, 'omb-btn--solid').length === 1 && byClass(card, 'omb-btn--soft').length === 1 && byClass(card, 'omb-btn--danger').length === 1)

/* —— 发票合并 —— */
const invoices = views.InvoicesView({ t, onBack: noop })
check('发票页有面包屑与标题', byClass(invoices, 'omb-crumb').length === 1 && byClass(invoices, 'omb-title')[0].children[0] === 'invoicesTitle')
check('发票页有拖放区', byClass(invoices, 'omb-drop').length === 1)
check('初始为空提示', hasText(invoices, 'invoicesEmpty') || byClass(invoices, 'omb-note').length >= 1)
check('有隐藏的文件选择框', byClass(invoices, 'omb-input').length >= 0 && JSON.stringify(invoices).includes('"type":"file"'))
const segments = byClass(invoices, 'omb-seg')
check('排版与纸张是分段选择器', segments.length === 2, segments.length)
check('排版有三档（自动/左右/上下）', byClass(invoices, 'omb-seg')[0].children.length === 3)
check('纸张有两档', byClass(invoices, 'omb-seg')[1].children.length === 2)
const buttons = byClass(invoices, 'omb-btn')
const printButton = buttons.find(button => button.children[0] === 'print')
const saveButton = buttons.find(button => button.children[0] === 'saveToFolder')
const downloadButton = buttons.find(button => button.children[0] === 'download')
check('打印按钮在有预览前禁用', Boolean(printButton) && printButton.props.disabled === true, printButton && printButton.props)
check('保存与下载在没有文件时禁用', Boolean(saveButton) && saveButton.props.disabled === true && Boolean(downloadButton) && downloadButton.props.disabled === true, [saveButton && saveButton.props, downloadButton && downloadButton.props])
check('预览卡片存在', byClass(invoices, 'omb-preview').length === 1)
check('预览区有标题与提示', byClass(invoices, 'omb-preview-head').length === 1 && byClass(invoices, 'omb-note').length >= 1)
check('打印走隐藏 iframe 助手', source.includes('async function printImages(urls, landscape)'))
check('页脚有说明', byClass(invoices, 'omb-foot').length === 1)

const invoicesConfigured = views.InvoicesView({ t, onBack: noop, config })
const configuredButtons = byClass(invoicesConfigured, 'omb-btn').map(button => button.children[0])
check('配置后可「从文件夹添加」', configuredButtons.includes('folderAdd'), configuredButtons)
check('有保存到文件夹与下载', configuredButtons.includes('saveToFolder') && configuredButtons.includes('download'), configuredButtons)

/* —— 书签夹 —— */
const bookmark = { id: 'b1', name: 'OA', url: 'https://oa.example.com', username: 'zhangsan', browser: 'chrome', customPath: '', hasPassword: true }
const rowProps2 = { t, item: bookmark, busy: false, onOpen: noop, onCopy: noop, onEdit: noop, onDelete: noop }
const bmRow = views.BookmarkRow(rowProps2)
check('书签行是卡片', bmRow.props.className === 'omb-card')
check('书签行展示浏览器与网址', byClass(bmRow, 'omb-count').length === 1 && byClass(bmRow, 'omb-mono').length === 1)
check('有密码时出现复制按钮', byClass(bmRow, 'omb-btn').map(button => button.children[0]).includes('copyPassword'), byClass(bmRow, 'omb-btn').map(button => button.children[0]))
check('打开按钮是实心', byClass(bmRow, 'omb-btn--solid').length === 1)
const bmRowNoPass = views.BookmarkRow(Object.assign({}, rowProps2, { item: Object.assign({}, bookmark, { hasPassword: false }) }))
check('无密码时没有复制按钮', !byClass(bmRowNoPass, 'omb-btn').map(button => button.children[0]).includes('copyPassword'))

const bmView = views.BookmarksView({ t, onBack: noop })
check('书签页有标题与新增入口', byClass(bmView, 'omb-title')[0].children[0] === 'bookmarksTitle' && byClass(bmView, 'omb-btn').some(button => button.children[0] === 'addBookmark'))
check('书签页有面包屑', byClass(bmView, 'omb-crumb').length === 1)

console.log(`\n${passed} 项通过`)

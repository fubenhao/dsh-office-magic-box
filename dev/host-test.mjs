/**
 * Host 半离线自测：用一个假 ctx 调 apply()，直接打我们注册的两个 /api 接口。
 * 用法：node dev/host-test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const sandbox = await fsp.mkdtemp(path.join(os.tmpdir(), 'omb-host-test-'))
process.env.DSH_HOME = sandbox

const { apply } = await import('../index.js')

/**
 * 造一个受管子进程假实现，语义对齐 dsh 的 subprocess SPD。
 * @param {object} spec 启动参数。
 * @returns {object} 句柄。
 */
function fakeSpawn(spec) {
  const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: process.env, windowsHide: true })
  const readers = {}
  for (const name of ['stdout', 'stderr']) {
    const maxBytes = spec.stdio[name].maxBytes
    let buffer = ''
    let lossy = false
    child[name].setEncoding('utf8')
    child[name].on('data', chunk => {
      buffer += chunk
      if (buffer.length > maxBytes) {
        buffer = buffer.slice(-maxBytes)
        lossy = true
      }
    })
    readers[name] = {
      readFrom(from) {
        return { text: buffer.slice(from), nextOffset: buffer.length, lossy }
      },
    }
  }
  let settled = false
  const done = new Promise(resolve => {
    child.on('close', (exitCode, signal) => {
      settled = true
      resolve({ exitCode, signal })
    })
  })
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: { stdout: readers.stdout, stderr: readers.stderr },
    done,
    terminate() {
      if (!settled) child.kill()
    },
    async waitForExit(signal) {
      if (settled) return true
      const timeout = new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), 5000)
        if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); resolve(false) }, { once: true })
      })
      return Promise.race([done.then(() => true), timeout])
    },
  }
}

const subprocess = {
  async terminalEnvironment() {
    return { platform: process.platform === 'win32' ? 'windows' : 'posix', defaultShell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' }
  },
  async resolveExecutable(command) {
    if (command === 'cmd.exe') return process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
    return command
  },
  spawn: fakeSpawn,
}

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const renderCalls = []
const officeKit = {
  async renderImages(request) {
    renderCalls.push(request)
    return {
      images: (request.pages || [1]).map(page => ({ png: pngBytes, width: 100, height: 141, page })),
      pageCount: 4,
      dpi: request.dpi,
      missingFonts: [],
    }
  },
}

const routes = new Map()
const effects = []
const ctx = {
  get(name) {
    if (name === 'connection') {
      return {
        fetch: {
          register(route) {
            if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
      }
    }
    if (name === 'subprocess') return subprocess
    if (name === 'officeKit') return officeKit
    return undefined
  },
  effect(callback) {
    const disposer = callback()
    effects.push(disposer)
    return disposer
  },
  timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  },
}

apply(ctx)

const state = routes.get('/api/office-magic-box/state')
const act = routes.get('/api/office-magic-box/act')
const invoices = routes.get('/api/office-magic-box/invoices')
const preview = routes.get('/api/office-magic-box/preview')
const settingsRoute = routes.get('/api/office-magic-box/settings')
const folderRoute = routes.get('/api/office-magic-box/invoices/folder')
const saveRoute = routes.get('/api/office-magic-box/invoices/save')
assert.ok(state, '应注册 GET /api/office-magic-box/state')
assert.ok(act, '应注册 POST /api/office-magic-box/act')
assert.ok(invoices, '应注册 POST /api/office-magic-box/invoices')
assert.ok(preview, '应注册 /api/office-magic-box/preview')
assert.ok(settingsRoute, '应注册 /api/office-magic-box/settings')
assert.ok(folderRoute, '应注册 /api/office-magic-box/invoices/folder')
assert.ok(saveRoute, '应注册 /api/office-magic-box/invoices/save')

/**
 * 调一次 GET state。
 * @returns {Promise<any>} 快照。
 */
async function readState() {
  const response = await state.fetch(new Request('http://dsh.internal/api/office-magic-box/state'))
  assert.equal(response.status, 200)
  return response.json()
}

/**
 * 调一次 act。
 * @param {object} body 动作体。
 * @returns {Promise<{ status: number, payload: any }>} 结果。
 */
async function doAct(body) {
  const response = await act.fetch(new Request('http://dsh.internal/api/office-magic-box/act', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  return { status: response.status, payload: await response.json() }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let passed = 0
const check = (label, condition, extra) => {
  assert.ok(condition, `${label}${extra ? ` → ${JSON.stringify(extra)}` : ''}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

console.log('office-magic-box host test')

const empty = await readState()
check('初始状态为空', empty.ok === true && empty.services.length === 0 && empty.scenes.length === 0)
check('状态文件路径已给出', typeof empty.stateFile === 'string' && empty.stateFile.endsWith('state.json'), empty.stateFile)

const quick = path.join(sandbox, 'quick.bat')
const long = path.join(sandbox, 'long.bat')
await fsp.writeFile(quick, '@echo hello-from-omb\r\n@exit /b 0\r\n', 'utf8')
await fsp.writeFile(long, '@ping -n 30 127.0.0.1 > nul\r\n', 'utf8')

const savedA = await doAct({ action: 'service.save', name: '快速服务', command: quick, cwd: sandbox, group: '演示' })
check('新增服务成功', savedA.status === 200 && savedA.payload.ok === true && savedA.payload.state.services.length === 1)
const serviceA = savedA.payload.state.services[0].id

const savedB = await doAct({ action: 'service.save', name: '长跑服务', command: long, cwd: sandbox })
check('新增第二个服务', savedB.payload.state.services.length === 2)
const serviceB = savedB.payload.state.services.find(item => item.name === '长跑服务').id

const badName = await doAct({ action: 'service.save', name: ' ', command: 'x' })
check('空名称被拒绝', badName.status === 400 && /名称/.test(badName.payload.error), badName.payload.error)

const badAction = await doAct({ action: 'nope' })
check('未知动作被拒绝', badAction.status === 400, badAction.payload.error)

const missing = await doAct({ action: 'service.start', id: 'no-such-service' })
check('启动不存在的服务被拒绝', missing.status === 400 && /找不到/.test(missing.payload.error), missing.payload.error)

const startedA = await doAct({ action: 'service.start', id: serviceA })
check('启动快速服务', startedA.status === 200 && startedA.payload.result.started === true)
await sleep(1200)
const afterQuick = await readState()
const quickState = afterQuick.services.find(item => item.id === serviceA)
check('快速服务跑完后状态为 exited', quickState.status === 'exited' && quickState.exitCode === 0, quickState.status)
check('快速服务输出被保留', /hello-from-omb/.test(quickState.log), quickState.log.slice(0, 120))

const startedB = await doAct({ action: 'service.start', id: serviceB })
check('启动长跑服务', startedB.payload.result.started === true)
const runningState = await readState()
check('长跑服务状态为 running', runningState.services.find(item => item.id === serviceB).status === 'running')

const stoppedB = await doAct({ action: 'service.stop', id: serviceB })
check('停止长跑服务', stoppedB.status === 200 && stoppedB.payload.result.stopped === true)
const afterStop = await readState()
const stoppedState = afterStop.services.find(item => item.id === serviceB).status
check('停止后状态不再是 running', stoppedState === 'stopped' || stoppedState === 'exited', stoppedState)

const sceneSaved = await doAct({
  action: 'scene.save',
  name: '早间开工',
  steps: [{ serviceId: serviceA, delayMs: 200 }, { serviceId: serviceB, delayMs: 200 }],
})
check('新增场景成功', sceneSaved.status === 200 && sceneSaved.payload.state.scenes.length === 1)
const sceneId = sceneSaved.payload.state.scenes[0].id

const emptyScene = await doAct({ action: 'scene.save', name: '空场景', steps: [] })
check('空场景被拒绝', emptyScene.status === 400 && /步骤|服务/.test(emptyScene.payload.error), emptyScene.payload.error)

const run = await doAct({ action: 'scene.run', id: sceneId })
check('场景开始运行', run.status === 200 && run.payload.state.sceneRun.running === true)

let runState = run.payload.state.sceneRun
for (let attempt = 0; attempt < 40 && runState.running; attempt += 1) {
  await sleep(250)
  runState = (await readState()).sceneRun
}
check('场景跑完', runState.running === false && runState.finishedAt !== null, runState)
check('场景两步都启动成功', runState.steps.every(step => step.status === 'started'), runState.steps)
await doAct({ action: 'scene.stop' })
const afterSceneStop = await readState()
check('停止场景后长跑服务已停', afterSceneStop.services.find(item => item.id === serviceB).status !== 'running', afterSceneStop.services.find(item => item.id === serviceB).status)

const persisted = JSON.parse(await fsp.readFile(path.join(sandbox, 'office-magic-box', 'state.json'), 'utf8'))
check('状态已落盘', persisted.services.length === 2 && persisted.scenes.length === 1)

const deletedA = await doAct({ action: 'service.delete', id: serviceA })
check('删除服务', deletedA.payload.state.services.length === 1)
check('删除服务后场景步骤同步清理', deletedA.payload.state.scenes[0].steps.length === 1)

const deletedScene = await doAct({ action: 'scene.delete', id: sceneId })
check('删除场景', deletedScene.payload.state.scenes.length === 0)

const broken = await doAct({ action: 'service.save', name: '坏目录', command: quick, cwd: path.join(sandbox, 'nope') })
const brokenId = broken.payload.state.services.find(item => item.name === '坏目录').id
const brokenStart = await doAct({ action: 'service.start', id: brokenId })
check('不存在的工作目录被拒绝', brokenStart.status === 400 && /工作目录/.test(brokenStart.payload.error), brokenStart.payload.error)
const brokenState = brokenStart.payload.state.services.find(item => item.id === brokenId)
check('启动失败落在卡片状态上', brokenState.status === 'failed' && /工作目录/.test(brokenState.error), brokenState.status)

const groupScene = await doAct({
  action: 'scene.save',
  name: '长跑组',
  steps: [{ serviceId: serviceB, delayMs: 100 }],
})
const groupSceneId = groupScene.payload.state.scenes[0].id
await doAct({ action: 'scene.run', id: groupSceneId })
let groupRun = (await readState()).sceneRun
for (let attempt = 0; attempt < 40 && groupRun.running; attempt += 1) {
  await sleep(200)
  groupRun = (await readState()).sceneRun
}
check('长跑场景跑完', groupRun.running === false)
check('场景跑完后服务还在运行', (await readState()).services.find(item => item.id === serviceB).status === 'running')

const wrongStop = await doAct({ action: 'scene.stop', id: 'another-scene' })
check('按 id 停别的场景不生效', wrongStop.status === 200 && wrongStop.payload.result.stopped === false)
check('误停后服务仍在运行', (await readState()).services.find(item => item.id === serviceB).status === 'running')

const rightStop = await doAct({ action: 'scene.stop', id: groupSceneId })
check('场景跑完后仍可一键停掉这一组', rightStop.status === 200 && rightStop.payload.result.stopped === true)
check('停组后服务已停止', (await readState()).services.find(item => item.id === serviceB).status !== 'running')

const { PDFDocument, StandardFonts } = await import('pdf-lib')

/**
 * 造一份最小发票 PDF 的字节。
 * @param {string} label 文本。
 * @returns {Promise<Uint8Array>} 字节。
 */
async function tinyInvoiceBytes(label) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.276, 841.89])
  page.drawText(label, { x: 24, y: 780, size: 16, font })
  return await doc.save()
}

/**
 * 造一份最小发票 PDF。
 * @param {string} label 文本。
 * @returns {Promise<string>} base64。
 */
async function tinyInvoice(label) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.276, 841.89])
  page.drawText(label, { x: 24, y: 780, size: 16, font })
  return Buffer.from(await doc.save()).toString('base64')
}

const invoiceResponse = await invoices.fetch(new Request('http://dsh.internal/api/office-magic-box/invoices', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    files: [
      { name: 'a.pdf', data: await tinyInvoice('Invoice A') },
      { name: 'b.pdf', data: await tinyInvoice('Invoice B') },
      { name: 'c.pdf', data: await tinyInvoice('Invoice C') },
    ],
    layout: 'auto',
    size: 'a4-portrait',
    marginMm: 8,
    cutLine: true,
  }),
}))
const invoiceBytes = Buffer.from(await invoiceResponse.arrayBuffer())
check('发票接口返回 200', invoiceResponse.status === 200, invoiceResponse.status)
check('返回 PDF 类型', (invoiceResponse.headers.get('content-type') || '').includes('application/pdf'))
check('内容是 PDF', invoiceBytes.slice(0, 5).toString() === '%PDF-')
const invoiceStats = JSON.parse(invoiceResponse.headers.get('x-omb-stats') || '{}')
check('统计随响应头返回', invoiceStats.pages === 2 && invoiceStats.invoices === 3 && invoiceStats.sheets === 1, invoiceStats)
check('下载文件名带扩展名', /.pdf"/.test(invoiceResponse.headers.get('content-disposition') || ''), invoiceResponse.headers.get('content-disposition'))

const badInvoice = await invoices.fetch(new Request('http://dsh.internal/api/office-magic-box/invoices', {
  method: 'POST',
  body: JSON.stringify({ files: [{ name: 'x.pdf', data: Buffer.from('not a pdf').toString('base64') }] }),
}))
const badBody = await badInvoice.json()
check('坏文件被友好拒绝', badInvoice.status === 400 && /不是 PDF/.test(badBody.error), badBody)

const previewPost = await preview.fetch(new Request('http://dsh.internal/api/office-magic-box/preview', {
  method: 'POST',
  body: JSON.stringify({
    files: [
      { name: 'a.pdf', data: await tinyInvoice('Invoice A') },
      { name: 'b.pdf', data: await tinyInvoice('Invoice B') },
    ],
    layout: 'auto',
    size: 'a4-portrait',
    marginMm: 8,
  }),
}))
const previewBody = await previewPost.json()
check('预览接口返回 token', previewPost.status === 200 && typeof previewBody.token === 'string', previewBody)
check('预览统计与页数', previewBody.pageCount === 1 && previewBody.rasterizer === true, previewBody)
check('预览声明最大 dpi', previewBody.maxDpi === 192, previewBody.maxDpi)

const shot = await preview.fetch(new Request(`http://dsh.internal/api/office-magic-box/preview?token=${previewBody.token}&page=1&dpi=110`))
const shotBytes = Buffer.from(await shot.arrayBuffer())
check('可取到单页 PNG', shot.status === 200 && (shot.headers.get('content-type') || '').includes('image/png'))
check('PNG 头正确', shotBytes.slice(1, 4).toString() === 'PNG')
check('渲染请求带上页码与 dpi', renderCalls.length === 1 && renderCalls[0].pages[0] === 1 && renderCalls[0].dpi === 110, renderCalls[0] && { pages: renderCalls[0].pages, dpi: renderCalls[0].dpi })
check('渲染请求声明 pdf 扩展', renderCalls[0].extension === 'pdf')
const source = renderCalls[0].source
const readBack = await source.read(new AbortController().signal, 1000000)
check('渲染源能回读 PDF 字节', Buffer.from(readBack.bytes.slice(0, 5)).toString() === '%PDF-')

const shotAgain = await preview.fetch(new Request(`http://dsh.internal/api/office-magic-box/preview?token=${previewBody.token}&page=1&dpi=110`))
check('同一页同 dpi 命中缓存', shotAgain.status === 200 && renderCalls.length === 1, renderCalls.length)

const shotDpi = await preview.fetch(new Request(`http://dsh.internal/api/office-magic-box/preview?token=${previewBody.token}&page=1&dpi=190`))
check('换 dpi 会重新渲染', shotDpi.status === 200 && renderCalls.length === 2, renderCalls.length)
check('dpi 被上限夹住', (await preview.fetch(new Request(`http://dsh.internal/api/office-magic-box/preview?token=${previewBody.token}&page=1&dpi=999`))).status === 200 && renderCalls[renderCalls.length - 1].dpi === 192, renderCalls[renderCalls.length - 1].dpi)

const badToken = await preview.fetch(new Request('http://dsh.internal/api/office-magic-box/preview?token=nope&page=1&dpi=110'))
check('未知 token 返回 404', badToken.status === 404)
const badPage = await preview.fetch(new Request(`http://dsh.internal/api/office-magic-box/preview?token=${previewBody.token}&page=9&dpi=110`))
check('越界页码返回 400', badPage.status === 400)

const settingsGet = await settingsRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/settings'))
const settingsBody = await settingsGet.json()
check('设置接口返回版本与路径', settingsGet.status === 200 && /^\d+\.\d+\.\d+$/.test(settingsBody.version), settingsBody.version)
check('设置接口带上作者', settingsBody.author === 'FBH · Forever Be Home' && settingsBody.license === 'MIT', [settingsBody.author, settingsBody.license])
check('插件目录存在', typeof settingsBody.plugin.dir === 'string' && fs.existsSync(settingsBody.plugin.dir), settingsBody.plugin.dir)
check('插件名与版本齐全', /office-magic-box$/.test(settingsBody.plugin.name) && settingsBody.plugin.version === settingsBody.version, settingsBody.plugin)
check('默认状态文件在 DSH 目录下', settingsBody.settings.custom.stateFile === false && settingsBody.settings.stateFile.endsWith('state.json'), settingsBody.settings.stateFile)
check('默认保存文件夹已给出', typeof settingsBody.settings.downloadDir === 'string' && settingsBody.settings.downloadDir.length > 2, settingsBody.settings.downloadDir)

const badSettings = await settingsRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/settings', {
  method: 'POST',
  body: JSON.stringify({ launcher: { stateFile: 'relative.json' } }),
}))
check('相对路径被拒绝', badSettings.status === 400 && /绝对路径/.test((await badSettings.json()).error))

const missingDir = await settingsRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/settings', {
  method: 'POST',
  body: JSON.stringify({ invoices: { openDir: path.join(sandbox, 'no-such-folder') } }),
}))
check('不存在的发票文件夹被拒绝', missingDir.status === 400 && /不存在/.test((await missingDir.json()).error))

const invoiceFolder = path.join(sandbox, 'invoices')
await fsp.mkdir(invoiceFolder, { recursive: true })
await fsp.writeFile(path.join(invoiceFolder, 'b.pdf'), Buffer.from(await tinyInvoiceBytes('Invoice B')))
await fsp.writeFile(path.join(invoiceFolder, 'a.pdf'), Buffer.from(await tinyInvoiceBytes('Invoice A')))
await fsp.writeFile(path.join(invoiceFolder, 'readme.txt'), 'not a pdf')
const saveDir = path.join(sandbox, 'exports')
const customState = path.join(sandbox, 'custom', 'my-state.json')

const applied = await settingsRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/settings', {
  method: 'POST',
  body: JSON.stringify({
    launcher: { stateFile: customState },
    invoices: { openDir: invoiceFolder, downloadDir: saveDir },
  }),
}))
const appliedBody = await applied.json()
check('设置保存成功', applied.status === 200 && appliedBody.settings.stateFile === customState, appliedBody.settings && appliedBody.settings.stateFile)
check('自定义保存文件夹被创建', fs.existsSync(saveDir))
check('自定义状态目录被创建', fs.existsSync(path.dirname(customState)))

const switchedState = await readState()
check('切换后状态文件指向新路径', switchedState.stateFile === customState, switchedState.stateFile)
check('新配置文件是空的', switchedState.services.length === 0)

const folderList = await folderRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/invoices/folder'))
const folderBody = await folderList.json()
check('文件夹只列出 PDF 且按名排序', folderList.status === 200 && folderBody.files.length === 2 && folderBody.files[0].name === 'a.pdf', folderBody.files.map(item => item.name))
check('文件夹路径回显', folderBody.dir === invoiceFolder)

const savedByPath = await saveRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/invoices/save', {
  method: 'POST',
  body: JSON.stringify({
    files: folderBody.files.map(item => ({ name: item.name, path: item.path })),
    layout: 'auto',
    size: 'a4-portrait',
    marginMm: 8,
  }),
}))
const savedBody = await savedByPath.json()
check('按路径合并并保存', savedByPath.status === 200 && fs.existsSync(savedBody.path), savedBody.error)
check('保存落在自定义文件夹', String(savedBody.path).startsWith(saveDir), savedBody.path)
check('保存结果带统计', savedBody.ok === true && savedBody.stats.pages === 1 && savedBody.stats.invoices === 2, savedBody.stats)
check('保存的是 PDF', fs.readFileSync(savedBody.path).slice(0, 5).toString() === '%PDF-')

const previewByPath = await preview.fetch(new Request('http://dsh.internal/api/office-magic-box/preview', {
  method: 'POST',
  body: JSON.stringify({ files: [{ name: 'a.pdf', path: path.join(invoiceFolder, 'a.pdf') }], layout: 'auto' }),
}))
const previewByPathBody = await previewByPath.json()
check('预览也支持路径文件', previewByPath.status === 200 && previewByPathBody.pageCount === 1, previewByPathBody.error)

const notPdf = await saveRoute.fetch(new Request('http://dsh.internal/api/office-magic-box/invoices/save', {
  method: 'POST',
  body: JSON.stringify({ files: [{ name: 'x.txt', path: path.join(invoiceFolder, 'readme.txt') }] }),
}))
check('非 PDF 路径被拒绝', notPdf.status === 400 && /不是 PDF/.test((await notPdf.json()).error))

for (const disposer of effects.slice().reverse()) {
  try {
    const result = disposer()
    if (result && typeof result.then === 'function') await result
  } catch {
    // ignore
  }
}
check('接口可被清理', !routes.has('/api/office-magic-box/state'))

try {
  await fsp.rm(sandbox, { recursive: true, force: true, maxRetries: 5 })
} catch {
  console.log(`（临时目录稍后可手动清理：${sandbox}）`)
}
console.log(`\n${passed} 项通过`)

/**
 * 办公魔盒 — Host 半。
 *
 * 职责：
 * 1. 把用户登记的服务（名称 / 启动命令 / 工作目录 / 打开地址）持久化到
 *    `$DSH_HOME/office-magic-box/state.json`；
 * 2. 通过 `ctx.subprocess` 启动、停止这些服务，并把子进程输出保留下来给面板看；
 * 3. 按场景（scene）顺序依次拉起多个服务；
 * 4. 通过 `ctx.connection.fetch` 在已认证的 `/api` 通道上暴露两个接口给浏览器半：
 *      GET  /api/office-magic-box/state  → 完整快照
 *      POST /api/office-magic-box/act    → 单个动作，返回动作结果 + 最新快照
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fsp from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { mergeInvoices, downloadFileName } from './lib/invoices.js'
import { BROWSER_IDS, browserCatalog, resolveLaunchPlan } from './lib/browsers.js'

/** 插件行名。 */
export const name = 'office-magic-box'

/** 需要的 Host 能力：已认证的浏览器通道 + 受管的子进程。 */
export const inject = ['connection', 'subprocess']

/** `/api` 下的接口前缀。 */
const API_BASE = '/api/office-magic-box'

/** 每个子进程保留的输出窗口字节数。 */
const LOG_BYTES = 200_000

/** 面板里展示的输出尾部字符数。 */
const LOG_TAIL_CHARS = 4_000

/** 内部保留的输出字符数上限，超过即裁掉最早的部分。 */
const LOG_KEEP_CHARS = 20_000

/** 场景步骤的默认间隔。 */
const DEFAULT_DELAY_MS = 800

/** 停止服务时等待进程退出的上限。 */
const STOP_TIMEOUT_MS = 8_000

/** 默认分组名。 */
const DEFAULT_GROUP = '默认分组'

/** 预览缓存：最多留几份合并结果、留多久、图片缓存上限、最大渲染 dpi。 */
const PREVIEW_LIMITS = {
  tokens: 6,
  ttlMs: 30 * 60 * 1000,
  imageBytes: 96 * 1024 * 1024,
  maxDpi: 192,
  maxPixels: 16 * 1000 * 1000,
  maxDimension: 4000,
  maxImageBytes: 40 * 1024 * 1024,
}

/** 设置文件版本。 */
const SETTINGS_VERSION = 1

/**
 * 插件数据目录：$DSH_HOME/office-magic-box，$DSH_HOME 缺省为 ~/.dsh。
 * @returns {string} 绝对路径。
 */
function dataDir() {
  const home = String(process.env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh')
  return path.join(home, 'office-magic-box')
}

/**
 * 默认状态文件位置。
 * @returns {string} 绝对路径。
 */
function defaultStateFilePath() {
  return path.join(dataDir(), 'state.json')
}

/**
 * 默认的发票文件夹：优先系统「文档」，没有就用用户目录。
 * @returns {string} 绝对路径。
 */
function defaultInvoiceOpenDir() {
  const documents = path.join(os.homedir(), 'Documents')
  if (existsSync(documents)) return documents
  return os.homedir()
}

/**
 * 默认的保存文件夹：系统「下载」。
 * @returns {string} 绝对路径。
 */
function defaultInvoiceDownloadDir() {
  const downloads = path.join(os.homedir(), 'Downloads')
  if (existsSync(downloads)) return downloads
  return path.join(dataDir(), 'exports')
}

/**
 * 空状态。
 * @returns {{ version: number, services: unknown[], scenes: unknown[] }} 新状态。
 */
function emptyState() {
  return { version: 1, services: [], scenes: [] }
}

/**
 * 取字符串字段。
 * @param {unknown} value 候选值。
 * @param {string} fallback 兜底。
 * @returns {string} 字符串。
 */
function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/**
 * 取毫秒数。
 * @param {unknown} value 候选值。
 * @param {number} fallback 兜底。
 * @returns {number} 非负毫秒数。
 */
function millis(value, fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return n < 0 ? 0 : n
}

/**
 * 规整一条服务记录，丢掉未知字段。
 * @param {unknown} raw 原始记录。
 * @param {number} index 序号，用于兜底名称。
 * @returns {object} 规整后的服务。
 */
function normalizeService(raw, index) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const name = text(source.name).trim() || `服务 ${index + 1}`
  return {
    id: text(source.id).trim() || randomUUID(),
    name,
    group: text(source.group).trim() || DEFAULT_GROUP,
    command: text(source.command),
    cwd: text(source.cwd).trim(),
    openUrl: text(source.openUrl).trim(),
    createdAt: millis(source.createdAt, Date.now()),
  }
}

/**
 * 规整一个场景，丢掉指向不存在服务的步骤。
 * @param {unknown} raw 原始记录。
 * @param {number} index 序号，用于兜底名称。
 * @param {Set<string>} serviceIds 现存服务 id。
 * @returns {object} 规整后的场景。
 */
function normalizeScene(raw, index, serviceIds) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const steps = Array.isArray(source.steps) ? source.steps : []
  return {
    id: text(source.id).trim() || randomUUID(),
    name: text(source.name).trim() || `场景 ${index + 1}`,
    stopOnError: source.stopOnError !== false,
    steps: steps
      .map(step => (step && typeof step === 'object' ? step : {}))
      .map(step => ({
        serviceId: text(step.serviceId).trim(),
        delayMs: millis(step.delayMs, DEFAULT_DELAY_MS),
      }))
      .filter(step => step.serviceId && serviceIds.has(step.serviceId)),
    createdAt: millis(source.createdAt, Date.now()),
  }
}

/**
 * 取错误消息。
 * @param {unknown} error 异常。
 * @returns {string} 可展示的消息。
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error ?? '未知错误')
}

/**
 * 注册 Host 半。
 * @param {import('@deepseek-ai/cordis').Context} ctx 插件上下文。
 */
export function apply(ctx) {
  /** @type {Map<string, object>} 服务 id → 运行时记录 */
  const runtime = new Map()

  /** @type {Map<string, { bytes: Uint8Array, pageCount: number, createdAt: number, images: Map<string, Uint8Array>, imageBytes: number }>} 预览用的合并结果 */
  const previews = new Map()

  /** @type {{ version: number, services: object[], scenes: object[] } | null} */
  let cache = null
  /** @type {Promise<object> | null} */
  let loading = null
  /** @type {object | null} 最近一次（或正在进行的）场景运行 */
  let sceneRun = null
  /** @type {Promise<void>} */
  let saving = Promise.resolve()

  /** @type {object | null} 已读取的书签 */
  let bookmarkCache = null
  /** @type {Promise<object> | null} */
  let bookmarkLoading = null
  /** @type {Promise<void>} */
  let bookmarkSaving = Promise.resolve()

  /** @type {object | null} 已读取的设置 */
  let settingsCache = null
  /** @type {Promise<object> | null} */
  let settingsLoading = null
  /** @type {Promise<object> | null} 插件信息缓存 */
  let infoPromise = null

  /**
   * 读插件自己的 package.json：名称、版本、作者、许可证、安装目录。
   * @returns {Promise<{ name: string, version: string, author: string, license: string, dir: string }>} 插件信息。
   */
  function pluginInfo() {
    if (!infoPromise) {
      const manifest = new URL('./package.json', import.meta.url)
      infoPromise = fsp.readFile(manifest, 'utf8')
        .then(raw => {
          const pkg = JSON.parse(raw)
          const author = typeof pkg.author === 'string'
            ? pkg.author
            : (pkg.author && typeof pkg.author.name === 'string' ? pkg.author.name : '')
          return {
            name: String(pkg.name || ''),
            version: String(pkg.version || ''),
            author,
            license: String(pkg.license || ''),
            dir: path.dirname(fileURLToPath(manifest)),
          }
        })
        .catch(() => ({ name: '', version: '', author: '', license: '', dir: '' }))
    }
    return infoPromise
  }

  /**
   * 只要版本号。
   * @returns {Promise<string>} 版本号。
   */
  async function pluginVersion() {
    return (await pluginInfo()).version
  }

  /**
   * 空设置。
   * @returns {object} 设置。
   */
  function emptySettings() {
    return {
      version: SETTINGS_VERSION,
      launcher: { stateFile: '' },
      invoices: { openDir: '', downloadDir: '' },
    }
  }

  /**
   * 规整设置：只保留认识的字段，路径做去空格。
   * @param {unknown} raw 原始设置。
   * @returns {object} 设置。
   */
  function normalizeSettings(raw) {
    const next = emptySettings()
    const source = raw && typeof raw === 'object' ? raw : {}
    const launcher = source.launcher && typeof source.launcher === 'object' ? source.launcher : {}
    const invoices = source.invoices && typeof source.invoices === 'object' ? source.invoices : {}
    next.launcher.stateFile = text(launcher.stateFile).trim()
    next.invoices.openDir = text(invoices.openDir).trim()
    next.invoices.downloadDir = text(invoices.downloadDir).trim()
    return next
  }

  /**
   * 读取设置（内存缓存）。
   * @returns {Promise<object>} 设置。
   */
  async function loadSettings() {
    if (settingsCache) return settingsCache
    if (settingsLoading) return settingsLoading
    settingsLoading = (async () => {
      let raw = null
      try {
        raw = JSON.parse(await fsp.readFile(path.join(dataDir(), 'settings.json'), 'utf8'))
      } catch {
        raw = null
      }
      settingsCache = normalizeSettings(raw)
      return settingsCache
    })().finally(() => { settingsLoading = null })
    return settingsLoading
  }

  /**
   * 把设置写盘。
   * @param {object} settings 设置。
   * @returns {Promise<void>} 写完后 resolve。
   */
  async function persistSettings(settings) {
    const file = path.join(dataDir(), 'settings.json')
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await fsp.writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await fsp.rename(temp, file)
  }

  /**
   * 把设置展开成实际生效的路径（空值回落默认值）。
   * @param {object} settings 设置。
   * @returns {object} 生效设置。
   */
  function resolvedSettings(settings) {
    return {
      stateFile: settings.launcher.stateFile || defaultStateFilePath(),
      openDir: settings.invoices.openDir || defaultInvoiceOpenDir(),
      downloadDir: settings.invoices.downloadDir || defaultInvoiceDownloadDir(),
      defaults: {
        stateFile: defaultStateFilePath(),
        openDir: defaultInvoiceOpenDir(),
        downloadDir: defaultInvoiceDownloadDir(),
      },
      custom: {
        stateFile: Boolean(settings.launcher.stateFile),
        openDir: Boolean(settings.invoices.openDir),
        downloadDir: Boolean(settings.invoices.downloadDir),
      },
    }
  }

  /**
   * 当前生效的状态文件路径。
   * @returns {Promise<string>} 绝对路径。
   */
  async function currentStateFile() {
    const settings = await loadSettings()
    return settings.launcher.stateFile || defaultStateFilePath()
  }

  /**
   * 校验并应用设置改动。
   * @param {object} patch 形如 { launcher: { stateFile }, invoices: { openDir, downloadDir } }。
   * @returns {Promise<object>} 生效后的设置。
   */
  async function applySettings(patch) {
    const current = await loadSettings()
    const merged = normalizeSettings({
      launcher: Object.assign({}, current.launcher, patch && patch.launcher),
      invoices: Object.assign({}, current.invoices, patch && patch.invoices),
    })

    const nextStateFile = merged.launcher.stateFile
    if (nextStateFile) {
      const absolute = path.resolve(nextStateFile)
      if (!path.isAbsolute(nextStateFile)) throw new Error('配置文件路径必须是绝对路径')
      if (!/\.json$/i.test(absolute)) throw new Error('配置文件路径必须以 .json 结尾')
      await fsp.mkdir(path.dirname(absolute), { recursive: true })
      const existing = await fsp.stat(absolute).catch(() => null)
      if (existing && existing.isDirectory()) throw new Error('配置文件路径指向了一个文件夹')
      merged.launcher.stateFile = absolute
    }

    if (merged.invoices.openDir) {
      const absolute = path.resolve(merged.invoices.openDir)
      if (!path.isAbsolute(merged.invoices.openDir)) throw new Error('发票文件夹必须是绝对路径')
      const stat = await fsp.stat(absolute).catch(() => null)
      if (!stat || !stat.isDirectory()) throw new Error(`发票文件夹不存在：${absolute}`)
      merged.invoices.openDir = absolute
    }

    if (merged.invoices.downloadDir) {
      const absolute = path.resolve(merged.invoices.downloadDir)
      if (!path.isAbsolute(merged.invoices.downloadDir)) throw new Error('保存文件夹必须是绝对路径')
      const stat = await fsp.stat(absolute).catch(() => null)
      if (stat && !stat.isDirectory()) throw new Error(`保存路径不是文件夹：${absolute}`)
      if (!stat) await fsp.mkdir(absolute, { recursive: true }).catch(() => {
        throw new Error(`保存文件夹无法创建：${absolute}`)
      })
      merged.invoices.downloadDir = absolute
    }

    await persistSettings(merged)
    settingsCache = merged

    // 换了配置文件：旧文件里的服务 id 在新文件里不存在，先把进程收掉再切。
    if (merged.launcher.stateFile !== current.launcher.stateFile) {
      for (const record of runtime.values()) {
        if (record.status !== 'running' && record.status !== 'stopping') continue
        try {
          record.handle.terminate()
        } catch {
          // 已经退出的进程忽略。
        }
      }
      runtime.clear()
      sceneRun = null
      cache = null
    }
    return resolvedSettings(merged)
  }

  /**
   * 等待一段时间；优先用框架的 timer，插件卸载时随之取消。
   * @param {number} ms 毫秒。
   * @returns {Promise<void>} 等待完成。
   */
  function sleep(ms) {
    if (typeof ctx.timeout === 'function') return ctx.timeout(ms)
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 读取状态（内存缓存，缺失时建空状态）。
   * @returns {Promise<{ version: number, services: object[], scenes: object[] }>} 状态。
   */
  async function loadState() {
    if (cache) return cache
    if (loading) return loading
    loading = (async () => {
      let raw = null
      try {
        raw = JSON.parse(await fsp.readFile(await currentStateFile(), 'utf8'))
      } catch {
        raw = null
      }
      const state = emptyState()
      if (raw && typeof raw === 'object') {
        const services = Array.isArray(raw.services) ? raw.services : []
        state.services = services.map(normalizeService)
        const ids = new Set(state.services.map(service => service.id))
        const scenes = Array.isArray(raw.scenes) ? raw.scenes : []
        state.scenes = scenes.map((scene, index) => normalizeScene(scene, index, ids))
      }
      cache = state
      return state
    })().finally(() => { loading = null })
    return loading
  }

  /**
   * 原子写入状态文件；写入串行化，避免两个动作互相覆盖。
   * @param {object} state 状态。
   * @returns {Promise<void>} 写完后 resolve。
   */
  function saveState(state) {
    saving = saving.then(async () => {
      const file = await currentStateFile()
      await fsp.mkdir(path.dirname(file), { recursive: true })
      const temp = `${file}.${process.pid}.tmp`
      await fsp.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await fsp.rename(temp, file)
    })
    return saving
  }

  /** @type {{ platform: 'windows' | 'posix', exe: string } | null} */
  let shell = null

  /**
   * 解析当前平台的 shell，用于执行用户登记的命令行。
   * @returns {Promise<{ platform: 'windows' | 'posix', exe: string }>} shell 信息。
   */
  async function resolveShell() {
    if (shell) return shell
    const subprocess = ctx.get('subprocess')
    if (!subprocess) throw new Error('当前环境没有提供 subprocess 服务，无法启动服务')
    const environment = await subprocess.terminalEnvironment()
    if (environment.platform === 'windows') {
      const exe = await subprocess.resolveExecutable('cmd.exe')
      shell = { platform: 'windows', exe }
    } else {
      shell = { platform: 'posix', exe: '/bin/sh' }
    }
    return shell
  }

  /**
   * 把一行命令包进平台 shell 的 argv。
   * @param {{ platform: 'windows' | 'posix', exe: string }} target shell。
   * @param {string} command 命令行。
   * @returns {string[]} argv。
   */
  function shellArgv(target, command) {
    return target.platform === 'windows'
      ? [target.exe, '/d', '/s', '/c', command]
      : [target.exe, '-lc', command]
  }

  /**
   * 校验工作目录，不存在时回落到进程工作目录。
   * @param {string} preferred 登记的工作目录。
   * @returns {Promise<string>} 可用目录。
   */
  async function resolveCwd(preferred) {
    if (preferred) {
      try {
        const stat = await fsp.stat(preferred)
        if (stat.isDirectory()) return preferred
      } catch {
        throw new Error(`工作目录不存在：${preferred}`)
      }
      throw new Error(`工作目录不是文件夹：${preferred}`)
    }
    return process.cwd()
  }

  /**
   * 增量读取一个运行时记录的输出，只保留尾部窗口。
   * 读取游标保证每轮只搬运新增的字节，不重复整窗拷贝。
   * @param {object} record 运行时记录。
   * @returns {{ text: string, truncated: boolean }} 输出尾部。
   */
  function readLog(record) {
    if (!record) return { text: '', truncated: false }
    if (!record.handle) {
      return { text: record.log || '', truncated: record.logTruncated === true }
    }
    const cursors = record.cursors || (record.cursors = { stdout: 0, stderr: 0 })
    let appended = ''
    for (const channel of ['stdout', 'stderr']) {
      const stream = record.handle.collected?.[channel]
      if (!stream) continue
      try {
        const chunk = stream.readFrom(cursors[channel])
        if (Number.isFinite(chunk.nextOffset) && chunk.nextOffset >= cursors[channel]) cursors[channel] = chunk.nextOffset
        if (chunk.text) appended += chunk.text
        if (chunk.lossy) record.logTruncated = true
      } catch {
        // 输出窗口不可读时忽略该流。
      }
    }
    if (appended) record.log = `${record.log || ''}${appended}`
    let kept = record.log || ''
    if (kept.length > LOG_KEEP_CHARS) {
      kept = kept.slice(-LOG_KEEP_CHARS)
      record.logTruncated = true
    }
    record.log = kept
    if (kept.length > LOG_TAIL_CHARS) {
      return { text: `…\n${kept.slice(-LOG_TAIL_CHARS)}`, truncated: true }
    }
    return { text: kept, truncated: record.logTruncated === true }
  }

  /**
   * 启动一个服务。
   * @param {string} serviceId 服务 id。
   * @returns {Promise<{ started: boolean, record: object }>} 启动结果。
   */
  async function startService(serviceId) {
    const state = await loadState()
    const service = state.services.find(item => item.id === serviceId)
    if (!service) throw new Error('找不到这个服务，可能已被删除')
    if (!service.command.trim()) throw new Error(`「${service.name}」还没有填启动命令`)
    const existing = runtime.get(serviceId)
    if (existing && (existing.status === 'running' || existing.status === 'stopping')) {
      // 正在运行或正在停止：不再拉开第二个进程，否则前一个会失去管理。
      return { started: false, record: existing }
    }

    const subprocess = ctx.get('subprocess')
    if (!subprocess) throw new Error('当前环境没有提供 subprocess 服务，无法启动服务')
    let target
    let cwd
    let handle
    try {
      target = await resolveShell()
      cwd = await resolveCwd(service.cwd)
      handle = subprocess.spawn({
        argv: shellArgv(target, service.command),
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: LOG_BYTES },
          stderr: { maxBytes: LOG_BYTES },
        },
        graceMs: 4_000,
      })
    } catch (error) {
      // 连进程都没起来：留下一条失败记录，让面板上的卡片自己说明原因，
      // 而不是只有一个一闪而过的提示条。
      runtime.set(serviceId, {
        id: serviceId,
        handle: null,
        status: 'failed',
        startedAt: Date.now(),
        endedAt: Date.now(),
        exitCode: null,
        signal: null,
        error: messageOf(error),
        cwd: service.cwd,
        command: service.command,
        log: '',
        logTruncated: false,
      })
      throw error
    }

    const record = {
      id: serviceId,
      handle,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      signal: null,
      error: '',
      cwd,
      command: service.command,
    }
    runtime.set(serviceId, record)

    handle.done.then(
      outcome => {
        record.status = record.status === 'stopping' ? 'stopped' : 'exited'
        record.exitCode = outcome.exitCode
        record.signal = outcome.signal
        record.endedAt = Date.now()
      },
      error => {
        record.status = 'failed'
        record.error = messageOf(error)
        record.endedAt = Date.now()
      },
    )

    return { started: true, record }
  }

  /**
   * 停止一个服务。
   * @param {string} serviceId 服务 id。
   * @returns {Promise<{ stopped: boolean }>} 停止结果。
   */
  async function stopService(serviceId) {
    const record = runtime.get(serviceId)
    if (!record || record.status !== 'running') return { stopped: false }
    record.status = 'stopping'
    try {
      record.handle.terminate()
    } catch {
      // 进程可能已经退出。
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), STOP_TIMEOUT_MS)
    try {
      await record.handle.waitForExit(controller.signal)
    } catch {
      // 超时也按已停止处理，记录保持原状。
    } finally {
      clearTimeout(timer)
    }
    if (record.status === 'stopping') {
      record.status = 'stopped'
      record.endedAt = Date.now()
    }
    return { stopped: true }
  }

  /**
   * 生成给面板用的快照。
   * @returns {Promise<object>} 快照。
   */
  async function snapshot() {
    const state = await loadState()
    const services = state.services.map(service => {
      const record = runtime.get(service.id)
      const log = record ? readLog(record) : { text: '', truncated: false }
      return {
        ...service,
        status: record ? record.status : 'stopped',
        startedAt: record ? record.startedAt : null,
        endedAt: record ? record.endedAt : null,
        exitCode: record ? record.exitCode : null,
        error: record ? record.error : '',
        log: log.text,
        logTruncated: log.truncated,
      }
    })
    return {
      ok: true,
      version: await pluginVersion(),
      services,
      scenes: state.scenes,
      sceneRun,
      stateFile: await currentStateFile(),
      platform: process.platform,
    }
  }

  /**
   * 保存（新增或更新）一个服务。
   * @param {object} input 表单内容。
   * @returns {Promise<{ serviceId: string }>} 结果。
   */
  async function saveService(input) {
    const state = await loadState()
    const id = text(input?.id).trim()
    const name = text(input?.name).trim()
    const command = text(input?.command).trim()
    if (!name) throw new Error('请填写服务名称')
    if (!command) throw new Error('请填写启动命令')
    const fields = {
      name,
      group: text(input?.group).trim() || DEFAULT_GROUP,
      command,
      cwd: text(input?.cwd).trim(),
      openUrl: text(input?.openUrl).trim(),
    }
    if (id) {
      const target = state.services.find(item => item.id === id)
      if (!target) throw new Error('找不到要修改的服务，可能已被删除')
      Object.assign(target, fields)
    } else {
      state.services.push({ id: randomUUID(), ...fields, createdAt: Date.now() })
    }
    await saveState(state)
    return { serviceId: id || state.services[state.services.length - 1].id }
  }

  /**
   * 删除一个服务（连带把它从所有场景里去掉）。
   * @param {object} input 请求内容。
   * @returns {Promise<{ removed: boolean }>} 结果。
   */
  async function deleteService(input) {
    const state = await loadState()
    const id = text(input?.id).trim()
    const index = state.services.findIndex(item => item.id === id)
    if (index < 0) return { removed: false }
    await stopService(id)
    runtime.delete(id)
    state.services.splice(index, 1)
    for (const scene of state.scenes) {
      scene.steps = scene.steps.filter(step => step.serviceId !== id)
    }
    await saveState(state)
    return { removed: true }
  }

  /**
   * 保存（新增或更新）一个场景。
   * @param {object} input 表单内容。
   * @returns {Promise<{ sceneId: string }>} 结果。
   */
  async function saveScene(input) {
    const state = await loadState()
    const id = text(input?.id).trim()
    const name = text(input?.name).trim()
    if (!name) throw new Error('请填写场景名称')
    const ids = new Set(state.services.map(service => service.id))
    const rawSteps = Array.isArray(input?.steps) ? input.steps : []
    const steps = rawSteps
      .map(step => (step && typeof step === 'object' ? step : {}))
      .map(step => ({ serviceId: text(step.serviceId).trim(), delayMs: millis(step.delayMs, DEFAULT_DELAY_MS) }))
      .filter(step => step.serviceId && ids.has(step.serviceId))
    if (steps.length === 0) throw new Error('场景里至少要有一个服务')
    const fields = { name, steps, stopOnError: input?.stopOnError !== false }
    if (id) {
      const target = state.scenes.find(item => item.id === id)
      if (!target) throw new Error('找不到要修改的场景，可能已被删除')
      Object.assign(target, fields)
    } else {
      state.scenes.push({ id: randomUUID(), ...fields, createdAt: Date.now() })
    }
    await saveState(state)
    return { sceneId: id || state.scenes[state.scenes.length - 1].id }
  }

  /**
   * 删除一个场景。
   * @param {object} input 请求内容。
   * @returns {Promise<{ removed: boolean }>} 结果。
   */
  async function deleteScene(input) {
    const state = await loadState()
    const id = text(input?.id).trim()
    const index = state.scenes.findIndex(item => item.id === id)
    if (index < 0) return { removed: false }
    state.scenes.splice(index, 1)
    if (sceneRun && sceneRun.sceneId === id && sceneRun.running) sceneRun.running = false
    await saveState(state)
    return { removed: true }
  }

  /**
   * 顺序启动一个场景（立即返回，进度写进 sceneRun 供面板轮询）。
   * @param {object} input 请求内容。
   * @returns {Promise<{ sceneId: string }>} 结果。
   */
  async function runScene(input) {
    const state = await loadState()
    const id = text(input?.id).trim()
    const scene = state.scenes.find(item => item.id === id)
    if (!scene) throw new Error('找不到这个场景，可能已被删除')
    if (sceneRun && sceneRun.running) throw new Error(`「${sceneRun.name}」还在启动中，先等它跑完`)
    const names = new Map(state.services.map(service => [service.id, service.name]))
    const run = {
      sceneId: scene.id,
      name: scene.name,
      running: true,
      stopped: false,
      startedAt: Date.now(),
      finishedAt: null,
      error: '',
      steps: scene.steps.map(step => ({
        serviceId: step.serviceId,
        name: names.get(step.serviceId) || '已删除的服务',
        delayMs: step.delayMs,
        status: 'pending',
        message: '',
      })),
    }
    sceneRun = run

    const execute = async () => {
      for (const step of run.steps) {
        if (!run.running) {
          step.status = 'skipped'
          continue
        }
        step.status = 'starting'
        try {
          const result = await startService(step.serviceId)
          if (!run.running) {
            // 启动过程中用户按了「停止这一组」：把这个刚起来的进程一并停掉，
            // 否则它会被留在后台而没人管理。
            await stopService(step.serviceId)
            step.status = 'stopped-by-scene'
            continue
          }
          step.status = result.started ? 'started' : 'already-running'
          if (!result.started) step.message = '已经在运行'
        } catch (error) {
          step.status = 'failed'
          step.message = messageOf(error)
          if (scene.stopOnError) {
            run.error = `「${step.name}」启动失败，场景已停下`
            break
          }
        }
        if (step.delayMs > 0 && run.running) {
          try {
            await sleep(step.delayMs)
          } catch {
            // 插件卸载时中断等待。
          }
        }
      }
      run.running = false
      run.finishedAt = Date.now()
    }

    execute().catch(error => {
      run.running = false
      run.finishedAt = Date.now()
      run.error = messageOf(error)
    })
    return { sceneId: scene.id }
  }

  /**
   * 停止一个场景：不再继续，并停掉这个场景已经拉起的服务。
   * 场景已经跑完时同样可用——「一键启动过的那一组，一键停掉」。
   * @param {object} input 请求内容（可带 id，只允许停它自己）。
   * @returns {Promise<{ stopped: boolean }>} 结果。
   */
  async function stopScene(input) {
    if (!sceneRun) return { stopped: false }
    const id = text(input?.id).trim()
    if (id && sceneRun.sceneId !== id) return { stopped: false }
    const wasRunning = sceneRun.running
    sceneRun.running = false
    sceneRun.stopped = true
    const started = sceneRun.steps.filter(step => (
      step.status === 'started' || step.status === 'already-running' || step.status === 'starting'
    ))
    for (const step of started) step.status = 'stopping'
    await Promise.all(started.map(step => stopService(step.serviceId)))
    for (const step of started) step.status = 'stopped-by-scene'
    if (wasRunning && !sceneRun.finishedAt) sceneRun.finishedAt = Date.now()
    return { stopped: true }
  }

  /**
   * 处理一个动作。
   * @param {object} body 请求体。
   * @returns {Promise<object>} 动作结果。
   */
  async function act(body) {
    const action = text(body?.action).trim()
    switch (action) {
      case 'service.save': return saveService(body)
      case 'service.delete': return deleteService(body)
      case 'service.start': {
        const result = await startService(text(body?.id).trim())
        return { started: result.started }
      }
      case 'service.stop': return stopService(text(body?.id).trim())
      case 'service.restart':
        await stopService(text(body?.id).trim())
        await startService(text(body?.id).trim())
        return { restarted: true }
      case 'scene.save': return saveScene(body)
      case 'scene.delete': return deleteScene(body)
      case 'scene.run': return runScene(body)
      case 'scene.stop': return stopScene(body)
      default: throw new Error(`未知动作：${action || '(空)'}`)
    }
  }

  /**
   * 把请求里的文件统一成「有字节」的形态：上传的走 base64，指定路径的由 Host 读盘。
   * @param {object} input 合并请求。
   * @returns {Promise<object>} 可直接交给 mergeInvoices 的请求。
   */
  async function resolveInputFiles(input) {
    const files = Array.isArray(input?.files) ? input.files : []
    const resolved = []
    for (const [index, file] of files.entries()) {
      const source = file && typeof file === 'object' ? file : {}
      const rawPath = text(source.path).trim()
      if (rawPath) {
        const absolute = path.resolve(rawPath)
        if (!/\.pdf$/i.test(absolute)) throw new Error(`「${path.basename(absolute)}」不是 PDF 文件`)
        const stat = await fsp.stat(absolute).catch(() => null)
        if (!stat || !stat.isFile()) throw new Error(`找不到文件：${absolute}`)
        if (stat.size > 25 * 1024 * 1024) throw new Error(`「${path.basename(absolute)}」超过 25MB`)
        const buffer = await fsp.readFile(absolute)
        resolved.push({
          name: path.basename(absolute),
          bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        })
        continue
      }
      resolved.push({ name: text(source.name, `第 ${index + 1} 份`), data: source.data })
    }
    return Object.assign({}, input, { files: resolved })
  }

  /**
   * 列出某个文件夹里的 PDF（按名称排序）。
   * @param {string} rawPath 文件夹路径；空则用设置里的默认文件夹。
   * @returns {Promise<{ dir: string, files: object[], truncated: boolean }>} 结果。
   */
  async function listInvoiceFolder(rawPath) {
    const settings = await loadSettings()
    const target = text(rawPath).trim() || resolvedSettings(settings).openDir
    const dir = path.resolve(target)
    const stat = await fsp.stat(dir).catch(() => null)
    if (!stat || !stat.isDirectory()) throw new Error(`文件夹不存在：${dir}`)
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (!entry.isFile() || !/\.pdf$/i.test(entry.name)) continue
      const absolute = path.join(dir, entry.name)
      const info = await fsp.stat(absolute).catch(() => null)
      if (!info) continue
      files.push({ name: entry.name, path: absolute, size: info.size, mtime: info.mtimeMs })
    }
    files.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    return { dir, files: files.slice(0, 200), truncated: files.length > 200 }
  }

  /**
   * 合并并直接存到设置里的「保存文件夹」。
   * @param {object} body 合并请求（可带 fileName）。
   * @returns {Promise<{ path: string, stats: object, size: number }>} 结果。
   */
  async function saveMergedFile(body) {
    const settings = await loadSettings()
    const target = resolvedSettings(settings).downloadDir
    const { bytes, stats } = await mergeInvoices(await resolveInputFiles(body))
    await fsp.mkdir(target, { recursive: true })
    const requested = text(body?.fileName).trim()
    const baseName = /\.pdf$/i.test(requested) ? path.basename(requested) : downloadFileName()
    let filePath = path.join(target, baseName)
    for (let index = 1; index < 1000; index += 1) {
      const exists = await fsp.stat(filePath).then(() => true, () => false)
      if (!exists) break
      filePath = path.join(target, baseName.replace(/\.pdf$/i, `-${index}.pdf`))
    }
    await fsp.writeFile(filePath, bytes)
    return { path: filePath, stats, size: bytes.byteLength }
  }

  /**
   * 书签文件路径（密码不在这里，见 credentialKey）。
   * @returns {string} 绝对路径。
   */
  function bookmarksFile() {
    return path.join(dataDir(), 'bookmarks.json')
  }

  /**
   * 空书签表。
   * @returns {{ version: number, items: object[] }} 书签表。
   */
  function emptyBookmarks() {
    return { version: 1, items: [] }
  }

  /**
   * 规整一条书签。
   * @param {unknown} raw 原始记录。
   * @param {number} index 序号。
   * @returns {object} 书签。
   */
  function normalizeBookmark(raw, index) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const browser = text(source.browser)
    return {
      id: text(source.id).trim() || randomUUID(),
      name: text(source.name).trim() || `书签 ${index + 1}`,
      url: text(source.url).trim(),
      username: text(source.username).trim(),
      browser: BROWSER_IDS.includes(browser) ? browser : 'system',
      customPath: text(source.customPath).trim(),
      createdAt: millis(source.createdAt, Date.now()),
    }
  }

  /**
   * 读取书签表（内存缓存）。
   * @returns {Promise<{ version: number, items: object[] }>} 书签表。
   */
  async function loadBookmarks() {
    if (bookmarkCache) return bookmarkCache
    if (bookmarkLoading) return bookmarkLoading
    bookmarkLoading = (async () => {
      let raw = null
      try {
        raw = JSON.parse(await fsp.readFile(bookmarksFile(), 'utf8'))
      } catch {
        raw = null
      }
      const state = emptyBookmarks()
      if (raw && Array.isArray(raw.items)) state.items = raw.items.map(normalizeBookmark)
      bookmarkCache = state
      return state
    })().finally(() => { bookmarkLoading = null })
    return bookmarkLoading
  }

  /**
   * 写书签表（原子写、串行化）。
   * @param {object} state 书签表。
   * @returns {Promise<void>} 写完 resolve。
   */
  function saveBookmarks(state) {
    bookmarkSaving = bookmarkSaving.then(async () => {
      const file = bookmarksFile()
      await fsp.mkdir(path.dirname(file), { recursive: true })
      const temp = `${file}.${process.pid}.tmp`
      await fsp.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await fsp.rename(temp, file)
    })
    return bookmarkSaving
  }

  /**
   * 书签密码在凭据服务里的键。
   * @param {string} id 书签 id。
   * @returns {string} 键。
   */
  function bookmarkCredentialKey(id) {
    return `office-magic-box/bookmark/${id}`
  }

  /**
   * 取凭据服务（可选能力）。
   * @returns {object | undefined} 服务。
   */
  function credentialStore() {
    try {
      const service = ctx.get('credentials')
      return service && typeof service.readRecord === 'function' ? service : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 读书签密码。
   * @param {string} id 书签 id。
   * @returns {Promise<string>} 密码，没有则空串。
   */
  async function readBookmarkPassword(id) {
    const store = credentialStore()
    if (!store) return ''
    try {
      const record = await store.readRecord(bookmarkCredentialKey(id))
      return record && record.kind === 'api-key' && typeof record.key === 'string' ? record.key : ''
    } catch {
      return ''
    }
  }

  /**
   * 写书签密码（走凭据服务，不落普通配置文件）。
   * @param {string} id 书签 id。
   * @param {string} password 密码。
   * @returns {Promise<void>} 写完 resolve。
   */
  async function writeBookmarkPassword(id, password) {
    const store = credentialStore()
    if (!store) throw new Error('当前环境没有凭据服务，密码不会被保存')
    await store.modifyRecord(bookmarkCredentialKey(id), async () => ({ kind: 'api-key', key: password }))
  }

  /**
   * 删除书签密码。
   * @param {string} id 书签 id。
   * @returns {Promise<void>} 删完 resolve。
   */
  async function clearBookmarkPassword(id) {
    const store = credentialStore()
    if (!store) return
    try {
      await store.deleteRecord(bookmarkCredentialKey(id))
    } catch {
      // 记录不存在时忽略。
    }
  }

  /**
   * 书签页需要的快照（含浏览器可用性与「是否已存密码」）。
   * @returns {Promise<object>} 快照。
   */
  async function bookmarkSnapshot() {
    const state = await loadBookmarks()
    const items = []
    for (const item of state.items) {
      items.push(Object.assign({}, item, { hasPassword: Boolean(await readBookmarkPassword(item.id)) }))
    }
    return {
      ok: true,
      items,
      browsers: browserCatalog(),
      credentials: Boolean(credentialStore()),
      file: bookmarksFile(),
    }
  }

  /**
   * 保存（新增或修改）一条书签。
   * @param {object} input 表单。
   * @returns {Promise<{ savedId: string }>} 结果。
   */
  async function saveBookmark(input) {
    const state = await loadBookmarks()
    const name = text(input?.name).trim()
    const url = text(input?.url).trim()
    if (!name) throw new Error('请填写名称')
    if (!/^https?:\/\//i.test(url)) throw new Error('网址必须以 http:// 或 https:// 开头')
    const browser = BROWSER_IDS.includes(text(input?.browser)) ? text(input.browser) : 'system'
    const customPath = text(input?.customPath).trim()
    if (browser === 'custom' && !customPath) throw new Error('选了自定义浏览器，请填写程序路径')

    const id = text(input?.id).trim()
    let item
    if (id) {
      item = state.items.find(entry => entry.id === id)
      if (!item) throw new Error('找不到这个书签，可能已被删除')
    } else {
      item = { id: randomUUID(), createdAt: Date.now() }
      state.items.push(item)
    }
    Object.assign(item, { name, url, username: text(input?.username).trim(), browser, customPath })

    const password = text(input?.password)
    if (password) await writeBookmarkPassword(item.id, password)
    if (input?.clearPassword === true) await clearBookmarkPassword(item.id)

    await saveBookmarks(state)
    return { savedId: item.id }
  }

  /**
   * 删除一条书签（连带密码记录）。
   * @param {object} input 请求。
   * @returns {Promise<{ removed: boolean }>} 结果。
   */
  async function deleteBookmark(input) {
    const state = await loadBookmarks()
    const id = text(input?.id).trim()
    const index = state.items.findIndex(entry => entry.id === id)
    if (index < 0) return { removed: false }
    state.items.splice(index, 1)
    await clearBookmarkPassword(id)
    await saveBookmarks(state)
    return { removed: true }
  }

  /**
   * 用书签指定的浏览器打开它。dryRun 只返回启动计划、不真的拉起进程（测试与预览用）。
   * @param {object} input 请求。
   * @returns {Promise<object>} 结果。
   */
  async function openBookmark(input) {
    const state = await loadBookmarks()
    const item = state.items.find(entry => entry.id === text(input?.id).trim())
    if (!item) throw new Error('找不到这个书签，可能已被删除')
    const plan = resolveLaunchPlan({
      browserId: item.browser,
      url: item.url,
      customPath: item.customPath,
    })
    if (input?.dryRun === true) return { plan }
    const child = spawn(plan.command, plan.args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return { plan, pid: child.pid ?? null }
  }

  /**
   * 取书签密码（供界面复制，不参与列表展示）。
   * @param {object} input 请求。
   * @returns {Promise<{ password: string, username: string }>} 凭据。
   */
  async function bookmarkSecret(input) {
    const state = await loadBookmarks()
    const item = state.items.find(entry => entry.id === text(input?.id).trim())
    if (!item) throw new Error('找不到这个书签，可能已被删除')
    const password = await readBookmarkPassword(item.id)
    if (!password) throw new Error('这个书签没有保存密码')
    return { password, username: item.username }
  }

  /**
   * 处理书签动作。
   * @param {object} body 请求体。
   * @returns {Promise<object>} 结果。
   */
  async function bookmarkAction(body) {
    const action = text(body?.action).trim()
    if (action === 'save') {
      const result = await saveBookmark(body)
      return Object.assign({}, result, { state: await bookmarkSnapshot() })
    }
    if (action === 'delete') {
      const result = await deleteBookmark(body)
      return Object.assign({}, result, { state: await bookmarkSnapshot() })
    }
    if (action === 'open') return openBookmark(body)
    if (action === 'secret') return bookmarkSecret(body)
    throw new Error(`未知动作：${action || '(空)'}`)
  }

  /**
   * 生成一个 JSON 响应。
   * @param {number} status 状态码。
   * @param {unknown} payload 负载。
   * @returns {Response} 响应。
   */
  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  /**
   * 把一次合并结果存成可预览的 token（超出数量上限时丢最旧的）。
   * @param {Uint8Array} bytes 合并后的 PDF。
   * @param {{ pages: number }} stats 统计。
   * @returns {string} token。
   */
  function rememberPreview(bytes, stats) {
    const token = randomUUID()
    previews.set(token, {
      bytes,
      pageCount: Math.max(1, Number(stats?.pages) || 1),
      createdAt: Date.now(),
      images: new Map(),
      imageBytes: 0,
    })
    while (previews.size > PREVIEW_LIMITS.tokens) {
      const oldest = previews.keys().next().value
      previews.delete(oldest)
    }
    return token
  }

  /**
   * 取一个未过期的预览条目。
   * @param {string} token token。
   * @returns {object | null} 条目。
   */
  function lookupPreview(token) {
    const key = String(token || '')
    const entry = previews.get(key)
    if (!entry) return null
    if (Date.now() - entry.createdAt > PREVIEW_LIMITS.ttlMs) {
      previews.delete(key)
      return null
    }
    return entry
  }

  /**
   * 用宿主自带的 PDFium 渲染一页为 PNG（带按页缓存）。
   * @param {object} entry 预览条目。
   * @param {string} token token，用作缓存键前缀。
   * @param {number} page 页码（从 1 开始）。
   * @param {number} dpi 渲染分辨率。
   * @returns {Promise<Uint8Array>} PNG 字节。
   */
  async function rasterizePage(entry, token, page, dpi) {
    const cacheKey = `${dpi}:${page}`
    const cached = entry.images.get(cacheKey)
    if (cached) return cached
    const officeKit = ctx.get('officeKit')
    if (!officeKit || typeof officeKit.renderImages !== 'function') {
      throw new Error('当前环境没有提供 PDF 渲染组件（officeKit），无法生成预览')
    }
    const version = String(entry.createdAt)
    const result = await officeKit.renderImages({
      extension: 'pdf',
      source: {
        key: `office-magic-box/${token}`,
        version,
        bytes: entry.bytes.byteLength,
        read: async () => ({ bytes: entry.bytes, version }),
      },
      pages: [page],
      dpi,
      maxImages: 1,
      maxPixels: PREVIEW_LIMITS.maxPixels,
      maxDimension: PREVIEW_LIMITS.maxDimension,
      maxBytes: PREVIEW_LIMITS.maxImageBytes,
    })
    const image = (result.images || []).find(item => item.page === page) || (result.images || [])[0]
    if (!image || !image.png) throw new Error(`第 ${page} 页渲染失败`)

    if (entry.imageBytes + image.png.byteLength > PREVIEW_LIMITS.imageBytes) {
      entry.images.clear()
      entry.imageBytes = 0
    }
    entry.images.set(cacheKey, image.png)
    entry.imageBytes += image.png.byteLength
    return image.png
  }

  const connection = ctx.get('connection')
  if (connection?.fetch && typeof connection.fetch.register === 'function') {
    ctx.effect(() => {
      const disposers = []
      const keep = disposer => {
        if (typeof disposer === 'function') disposers.push(disposer)
      }
      try {
        keep(connection.fetch.register({
          path: `${API_BASE}/state`,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async () => {
            try {
              return jsonResponse(200, await snapshot())
            } catch (error) {
              return jsonResponse(500, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/act`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async request => {
            let body = {}
            try {
              const raw = await request.text()
              body = raw ? JSON.parse(raw) : {}
            } catch {
              return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
            }
            try {
              const result = await act(body)
              return jsonResponse(200, { ok: true, result, state: await snapshot() })
            } catch (error) {
              let state = null
              try {
                state = await snapshot()
              } catch {
                state = null
              }
              return jsonResponse(400, { ok: false, error: messageOf(error), state })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/invoices`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async request => {
            let body = {}
            try {
              const raw = await request.text()
              body = raw ? JSON.parse(raw) : {}
            } catch {
              return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
            }
            try {
              const { bytes, stats } = await mergeInvoices(await resolveInputFiles(body))
              return new Response(bytes, {
                status: 200,
                headers: {
                  'content-type': 'application/pdf',
                  'content-disposition': `attachment; filename="${downloadFileName()}"`,
                  'cache-control': 'no-store',
                  'x-omb-stats': JSON.stringify(stats),
                },
              })
            } catch (error) {
              return jsonResponse(400, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/bookmarks`,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async request => {
            if (request.method === 'GET') {
              try {
                return jsonResponse(200, await bookmarkSnapshot())
              } catch (error) {
                return jsonResponse(500, { ok: false, error: messageOf(error) })
              }
            }
            let body = {}
            try {
              const raw = await request.text()
              body = raw ? JSON.parse(raw) : {}
            } catch {
              return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
            }
            try {
              return jsonResponse(200, Object.assign({ ok: true }, await bookmarkAction(body)))
            } catch (error) {
              return jsonResponse(400, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/settings`,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async request => {
            if (request.method === 'GET') {
              try {
                const settings = await loadSettings()
                const info = await pluginInfo()
                return jsonResponse(200, {
                  ok: true,
                  version: info.version,
                  author: info.author,
                  license: info.license,
                  plugin: info,
                  settings: resolvedSettings(settings),
                })
              } catch (error) {
                return jsonResponse(500, { ok: false, error: messageOf(error) })
              }
            }
            let body = {}
            try {
              const raw = await request.text()
              body = raw ? JSON.parse(raw) : {}
            } catch {
              return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
            }
            try {
              const settings = await applySettings(body)
              const info = await pluginInfo()
              return jsonResponse(200, {
                ok: true,
                version: info.version,
                author: info.author,
                license: info.license,
                plugin: info,
                settings,
              })
            } catch (error) {
              return jsonResponse(400, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/invoices/folder`,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async request => {
            const url = new URL(request.url)
            try {
              const listing = await listInvoiceFolder(url.searchParams.get('path'))
              return jsonResponse(200, Object.assign({ ok: true }, listing))
            } catch (error) {
              return jsonResponse(400, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/invoices/save`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async request => {
            let body = {}
            try {
              const raw = await request.text()
              body = raw ? JSON.parse(raw) : {}
            } catch {
              return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
            }
            try {
              const saved = await saveMergedFile(body)
              return jsonResponse(200, Object.assign({ ok: true }, saved))
            } catch (error) {
              return jsonResponse(400, { ok: false, error: messageOf(error) })
            }
          },
        }))
        keep(connection.fetch.register({
          path: `${API_BASE}/preview`,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async request => {
            const officeKit = ctx.get('officeKit')
            const rasterizer = Boolean(officeKit && typeof officeKit.renderImages === 'function')

            if (request.method === 'POST') {
              let body = {}
              try {
                const raw = await request.text()
                body = raw ? JSON.parse(raw) : {}
              } catch {
                return jsonResponse(400, { ok: false, error: '请求内容不是合法 JSON' })
              }
              try {
                const { bytes, stats } = await mergeInvoices(await resolveInputFiles(body))
                const token = rememberPreview(bytes, stats)
                return jsonResponse(200, {
                  ok: true,
                  token,
                  pageCount: stats.pages,
                  stats,
                  rasterizer,
                  maxDpi: PREVIEW_LIMITS.maxDpi,
                })
              } catch (error) {
                return jsonResponse(400, { ok: false, error: messageOf(error) })
              }
            }

            const url = new URL(request.url)
            const entry = lookupPreview(url.searchParams.get('token'))
            if (!entry) return new Response('preview expired', { status: 404, headers: { 'cache-control': 'no-store' } })
            const page = Number(url.searchParams.get('page'))
            if (!Number.isInteger(page) || page < 1 || page > entry.pageCount) {
              return new Response('invalid page', { status: 400, headers: { 'cache-control': 'no-store' } })
            }
            const requested = Number(url.searchParams.get('dpi'))
            const dpi = Number.isFinite(requested) && requested > 0
              ? Math.min(PREVIEW_LIMITS.maxDpi, Math.max(36, Math.round(requested)))
              : 110
            try {
              const png = await rasterizePage(entry, url.searchParams.get('token'), page, dpi)
              return new Response(png, {
                status: 200,
                headers: {
                  'content-type': 'image/png',
                  'cache-control': 'private, max-age=300',
                },
              })
            } catch (error) {
              return jsonResponse(503, { ok: false, error: messageOf(error) })
            }
          },
        }))
      } catch (error) {
        console.error(`[office-magic-box] 注册接口失败：${messageOf(error)}`)
      }
      return () => {
        for (const disposer of disposers) {
          try {
            const result = disposer()
            if (result && typeof result.then === 'function') result.catch(() => {})
          } catch {
            // 清理失败不影响卸载。
          }
        }
      }
    }, 'office-magic-box: /api routes')
  } else {
    console.error('[office-magic-box] 当前 profile 没有可用的浏览器通道，面板无法读取状态')
  }

  ctx.effect(() => () => {
    for (const record of runtime.values()) {
      if (record.status !== 'running' && record.status !== 'stopping') continue
      try {
        record.handle.terminate()
      } catch {
        // 忽略已经退出的进程。
      }
    }
  }, 'office-magic-box: stop managed processes')
}

/**
 * 书签夹的浏览器目录与启动参数（纯函数，便于单测）。
 *
 * 设计取舍：书签打开的是「用户自己的浏览器」，所以这里只生成启动计划
 * （命令 + 参数），由 Host 用 detached 子进程拉起——不能挂在插件的 subprocess
 * 生命周期上，否则插件重载会顺手把用户的浏览器关掉。
 */

import { existsSync } from 'node:fs'

/** 各平台常见的浏览器安装位置；路径里的环境变量在解析时展开。 */
const PRESET_PATHS = {
  chrome: {
    win32: ['%ProgramFiles%/Google/Chrome/Application/chrome.exe', '%ProgramFiles(x86)%/Google/Chrome/Application/chrome.exe', '%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['google-chrome', 'google-chrome-stable'],
  },
  edge: {
    win32: ['%ProgramFiles(x86)%/Microsoft/Edge/Application/msedge.exe', '%ProgramFiles%/Microsoft/Edge/Application/msedge.exe'],
    darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['microsoft-edge', 'microsoft-edge-stable'],
  },
  firefox: {
    win32: ['%ProgramFiles%/Mozilla Firefox/firefox.exe', '%ProgramFiles(x86)%/Mozilla Firefox/firefox.exe'],
    darwin: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
    linux: ['firefox'],
  },
  brave: {
    win32: ['%ProgramFiles%/BraveSoftware/Brave-Browser/Application/brave.exe', '%LOCALAPPDATA%/BraveSoftware/Brave-Browser/Application/brave.exe'],
    darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    linux: ['brave-browser'],
  },
}

/** 客户端可选的浏览器 id（system = 系统默认浏览器）。 */
export const BROWSER_IDS = ['system', 'chrome', 'edge', 'firefox', 'brave', 'custom']

/**
 * 展开路径里的 %VAR%（Windows），并按平台统一分隔符。
 * @param {string} candidate 候选路径。
 * @param {string} platform 平台标识。
 * @returns {string} 展开后的路径。
 */
function expand(candidate, platform) {
  const expanded = candidate.replace(/%([^%]+)%/g, (whole, name) => process.env[name] ?? '')
  return platform === 'win32' ? expanded.replace(/\//g, '\\') : expanded
}

/**
 * 判断一个候选是否可用：绝对路径看存在性，裸命令（linux）视为可用。
 * @param {string} candidate 候选路径。
 * @param {(value: string) => boolean} exists 存在性判断。
 * @param {string} platform 平台标识。
 * @returns {string | null} 可用路径，或 null。
 */
function usable(candidate, exists, platform) {
  const resolved = expand(candidate, platform)
  if (!resolved) return null
  // POSIX 下的裸命令（如 firefox）交给系统 PATH 解析，不检查文件。
  if (platform !== 'win32' && platform !== 'darwin' && !resolved.includes('/')) return resolved
  return exists(resolved) ? resolved : null
}

/**
 * 列出各浏览器在当前机器上是否可用。
 * @param {{ platform?: string, exists?: (value: string) => boolean }} [options] 注入项（测试用）。
 * @returns {Array<{ id: string, available: boolean, path?: string }>} 目录。
 */
export function browserCatalog(options = {}) {
  const platform = options.platform || process.platform
  const exists = options.exists || existsSync
  const catalog = [{ id: 'system', available: true }]
  for (const [id, perPlatform] of Object.entries(PRESET_PATHS)) {
    const candidates = perPlatform[platform] || []
    let found = null
    for (const candidate of candidates) {
      found = usable(candidate, exists, platform)
      if (found) break
    }
    catalog.push(found ? { id, available: true, path: found } : { id, available: false })
  }
  catalog.push({ id: 'custom', available: true })
  return catalog
}

/**
 * 生成一次「打开书签」的启动计划。
 * @param {{ browserId?: string, url: string, customPath?: string, platform?: string, exists?: (value: string) => boolean }} request 参数。
 * @returns {{ command: string, args: string[], label: string }} 启动计划。
 */
export function resolveLaunchPlan(request) {
  const platform = request.platform || process.platform
  const exists = request.exists || existsSync
  const url = String(request.url || '').trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('书签网址必须是 http:// 或 https:// 开头')
  const browserId = BROWSER_IDS.includes(request.browserId) ? request.browserId : 'system'

  if (browserId === 'system') {
    if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', `start "" "${url}"`], label: 'system' }
    if (platform === 'darwin') return { command: 'open', args: [url], label: 'system' }
    return { command: 'xdg-open', args: [url], label: 'system' }
  }

  if (browserId === 'custom') {
    const customPath = String(request.customPath || '').trim()
    if (!customPath) throw new Error('选了自定义浏览器，但没有填程序路径')
    if (!exists(customPath)) throw new Error(`自定义浏览器路径不存在：${customPath}`)
    return { command: customPath, args: [url], label: 'custom' }
  }

  const entry = browserCatalog({ platform, exists }).find(item => item.id === browserId)
  if (!entry || !entry.available || !entry.path) {
    throw new Error(`这台机器上没找到 ${browserId}，请改用「系统默认」或自定义路径`)
  }
  return { command: entry.path, args: [url], label: browserId }
}

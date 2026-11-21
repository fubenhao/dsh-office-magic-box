/**
 * 办公魔盒 — 浏览器半。
 *
 * 一个左侧栏图标 + 一块主面板，里面对应多个小工具：
 *  · 主页：各功能的入口卡片；
 *  · 启动中控台：登记本机服务，逐个启动 / 场景顺序启动；
 *  · 发票合并：多张发票 PDF → 一份「每张 A4 两张、双面打印」的文件。
 * 数据与合并都在 Host 半完成，这里只做界面。
 */
window.__ModuleLoader__.load({
  id: 'dsh-office-magic-box',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /** 字典命名空间。 */
    const NS = 'officeMagicBox'
    /** `/api` 下的接口前缀。 */
    const API_BASE = '/api/office-magic-box'
    /** 面板空闲时的轮询间隔。 */
    const POLL_MS = 3000
    /** 场景启动过程中的轮询间隔。 */
    const POLL_ACTIVE_MS = 700
    /** 提示条自动消失时间。 */
    const NOTICE_MS = 3000
    /** 发票合并请求的超时时间：几十份 PDF 也要给够。 */
    const MERGE_TIMEOUT_MS = 180000

    const zh = {
      panel: '办公魔盒',
      title: '办公魔盒',
      subtitle: '两个小工具：把本机服务一键拉起来，或者把一堆发票拼成一页两张。',
      homeFooter: '两个工具都在本机运行，文件不会离开这台电脑。',
      featureLauncher: '启动中控台',
      featureLauncherDesc: '把本机的服务、系统、脚本登记一次，之后点一下就能启动；多个服务可以编成场景，按顺序一键拉起。',
      featureLauncherMeta: '{services} 个服务 · {scenes} 个场景',
      featureLauncherMetaEmpty: '还没有登记服务',
      featureInvoices: '发票合并',
      featureInvoicesDesc: '多张发票 PDF 合并成一个文件：每张 A4 放两张，双面打印正好一面两张。',
      featureInvoicesMeta: '每张 A4 两张 · 适合公司报销',
      open: '打开',
      back: '办公魔盒',
      refresh: '刷新',
      working: '处理中…',
      dismiss: '知道了',
      cancel: '取消',
      delete: '删除',
      save: '保存',
      /* —— 启动中控台 —— */
      launcherTitle: '启动中控台',
      launcherSubtitle: '把盘里的服务、系统、脚本登记到这里，点一下就能启动；也可以把几个服务编成一个场景，按顺序一键拉起。',
      hint: '登记内容保存在本机配置文件里，重启后还在。',
      stateFile: '配置文件',
      addService: '新增服务',
      addScene: '新建场景',
      services: '服务',
      scenes: '场景',
      defaultGroup: '默认分组',
      empty: '还没有登记服务。填上启动命令和工作目录，之后从这里一键启动。',
      emptyScenes: '还没有场景。把几个服务编进同一个场景，就能按顺序一键启动。',
      name: '名称',
      group: '分组',
      command: '启动命令',
      commandHint: '整行命令，例如 npm run dev、start.bat、python app.py',
      cwd: '工作目录',
      cwdHint: '留空则使用当前工作目录',
      openUrl: '打开地址（可选）',
      openUrlHint: '例如 http://localhost:3000',
      pickDir: '选择目录',
      start: '启动',
      stop: '停止',
      restart: '重启',
      output: '输出',
      hideOutput: '收起输出',
      edit: '编辑',
      confirmDeleteService: '删除「{name}」？它会从所有场景里移除，正在运行的进程会先被停止。',
      confirmDeleteScene: '删除场景「{name}」？已经启动的服务不会被停止。',
      statusRunning: '运行中',
      statusStopping: '正在停止',
      statusStopped: '未启动',
      statusExited: '已退出',
      statusFailed: '启动失败',
      runScene: '一键启动',
      stopScene: '停止这一组',
      addStep: '添加一步',
      stepDelay: '间隔',
      ms: '毫秒',
      steps: '步骤',
      sceneRunning: '场景启动中…',
      sceneFinished: '场景已跑完',
      sceneStopped: '场景已停止',
      sceneFailed: '场景中断',
      sceneBusyOther: '另一个场景正在启动，先等它跑完',
      sceneBusyHint: '场景正在启动这一组，先等它跑完',
      selectService: '选择服务',
      noSteps: '场景里还没有步骤',
      noCwd: '未指定工作目录',
      noOutput: '（还没有输出）',
      logTruncated: '仅显示最近输出',
      loading: '读取中…',
      saved: '已保存',
      savedNextStart: '已保存，重启这个服务后生效',
      pickerUnavailable: '目录选择器不可用，请手动填写路径',
      newService: '新服务',
      newScene: '新场景',
      stepStarted: '已启动',
      stepAlready: '原本就在运行',
      stepFailed: '启动失败',
      stepPending: '等待中',
      stepStarting: '正在启动',
      stepStopping: '正在停止',
      stepStopped: '已被场景停止',
      stepSkipped: '已跳过',
      unknownStep: '已删除的服务',
      startedAt: '启动于',
      exitCode: '退出码',
      needName: '请填名称',
      needCommand: '请填启动命令',
      needStep: '至少添加一个步骤',
      needServiceFirst: '先登记至少一个服务，才能编场景',
      allServicesUsed: '所有服务都已经在场景里了',
      stopOnError: '某步失败就停下',
      editLiveHint: '正在运行；改动在重启后生效',
      /* —— 发票合并 —— */
      invoicesTitle: '发票合并',
      invoicesSubtitle: '选好几张发票 PDF，生成一个文件：每张 A4 两面各两张、按顺序排好，直接双面打印。',
      dropTitle: '把发票 PDF 拖到这里，或者',
      chooseFiles: '选择文件',
      clearFiles: '清空',
      invoicesEmpty: '还没有选择文件。一次最多 60 份，每份不超过 25MB。',
      layoutLabel: '排版',
      layoutAuto: '自动',
      layoutSide: '左右两张',
      layoutStack: '上下两张',
      sizeLabel: '纸张',
      sizePortrait: 'A4 纵向',
      sizeLandscape: 'A4 横向',
      marginLabel: '页边距',
      marginUnit: '毫米',
      cutLine: '中缝画裁切线',
      generate: '生成打印文件',
      generating: '正在生成…',
      resultSummary: '已生成 {pages} 页 · {sheets} 张纸（双面）· {invoices} 张发票',
      resultAutoLayout: '自动选了「{layout}」',
      printHint: '打印时选「双面打印、长边翻页」，每面两张；文件已经按上传顺序排好。',
      needFiles: '先选择至少一份 PDF 发票',
      onlyPdf: '只支持 PDF 文件，已跳过：{names}',
      removeFile: '移除',
      moveUp: '上移',
      moveDown: '下移',
      invoicesFooter: '合并在本机完成，文件不会被上传到任何地方。',
      settings: '设置',
      settingsTitle: '设置',
      settingsSubtitle: '路径都在本机；改完点「保存」立即生效。',
      sectionLauncher: '启动中控台',
      sectionInvoices: '发票合并',
      sectionBookmarks: '书签夹',
      bookmarkFileLabel: '清单文件（bookmarks.json）',
      bookmarkFileHint: '默认：{path}。这个文件里不含密码，密码存在宿主凭据库。',
      stateFileLabel: '配置文件（state.json）',
      stateFileHint: '默认：{path}。换文件后当前运行的服务会先被停止。',
      openDirLabel: '默认打开文件夹',
      openDirHint: '「从文件夹添加」会先读这个文件夹里的 PDF。',
      downloadDirLabel: '默认保存文件夹',
      downloadDirHint: '「保存到文件夹」把生成的 PDF 放到这里。',
      useDefault: '恢复默认',
      resetDone: '已恢复默认',
      folderAdd: '从文件夹添加',
      folderScanning: '正在读取文件夹…',
      folderEmpty: '这个文件夹里没有 PDF 文件',
      folderAddSelected: '添加所选（{count}）',
      selectAll: '全选',
      saveToFolder: '保存到文件夹',
      savedTo: '已保存到',
      pathFile: '文件夹内',
      download: '下载',
      featureBookmarks: '书签夹',
      featureBookmarksDesc: '把常用办公系统的地址、账号和指定浏览器存一处，点一下就用那个浏览器打开。',
      featureBookmarksMeta: '常用系统 · 一键打开',
      bookmarksTitle: '书签夹',
      bookmarksSubtitle: '存好地址、账号和想用的浏览器，之后点「打开」直接进系统；密码存在宿主凭据库，不写进普通配置。',
      addBookmark: '新增书签',
      emptyBookmarks: '还没有书签。填上系统地址、账号和想用的浏览器，之后点「打开」即可。',
      bookmarkName: '名称',
      bookmarkUrl: '网址',
      bookmarkUrlHint: 'http:// 或 https:// 开头',
      bookmarkUsername: '用户名',
      bookmarkPassword: '密码',
      bookmarkPasswordKeep: '已保存密码；留空表示不修改',
      bookmarkPasswordEmpty: '还没保存密码',
      passwordSavedShort: '密码已存',
      bookmarkBrowser: '打开方式',
      bookmarkCustomPath: '浏览器程序路径',
      browserSystem: '系统默认浏览器',
      browserChrome: 'Chrome',
      browserEdge: 'Edge',
      browserFirefox: 'Firefox',
      browserBrave: 'Brave',
      browserCustom: '自定义程序',
      browserNotInstalled: '（未安装）',
      copyPassword: '复制密码',
      clearPassword: '清除已保存的密码',
      credentialsUnavailable: '当前环境没有凭据服务：其它信息照常保存，密码不会被存。',
      openedWith: '已用 {browser} 打开',
      credentialCopied: '已复制到剪贴板',
      aboutTitle: '关于',
      aboutName: '名称',
      aboutVersion: '版本',
      aboutAuthor: '作者',
      aboutLicense: '许可证',
      aboutDir: '插件目录',
      signature: '「此心安处是吾乡」',
      previewTitle: '预览',
      previewPages: '{count} 页',
      previewEmpty: '选好发票后，这里会立刻显示生成的每一页。',
      previewBusy: '正在生成预览…',
      previewFailed: '预览失败：{reason}',
      previewUnavailable: '当前环境没有 PDF 渲染组件，无法预览；可以点「生成打印文件」导出后用系统 PDF 阅读器打印。',
      print: '打印',
      printing: '正在准备打印…',
      pageLabel: '第 {page} 页',
      previewImageFailed: '有页面渲染失败，可以重试或直接生成文件。',
      fileCount: '已选 {count} 份',
    }

    const en = {
      panel: 'Office magic box',
      title: 'Office magic box',
      subtitle: 'Two small tools: start local services in one click, or fit a pile of invoices two to an A4 sheet.',
      homeFooter: 'Both tools run on this machine; files never leave it.',
      featureLauncher: 'Launch console',
      featureLauncherDesc: 'Register each local service, system, or script once, then start it with one click. Group several into a scene and start it in order.',
      featureLauncherMeta: '{services} services · {scenes} scenes',
      featureLauncherMetaEmpty: 'No services registered yet',
      featureInvoices: 'Invoice merge',
      featureInvoicesDesc: 'Merge several invoice PDFs into one file with two invoices per A4 side, ready for duplex printing.',
      featureInvoicesMeta: 'Two per A4 side · made for expense reports',
      open: 'Open',
      back: 'Office magic box',
      refresh: 'Refresh',
      working: 'Working…',
      dismiss: 'Dismiss',
      cancel: 'Cancel',
      delete: 'Delete',
      save: 'Save',
      /* launcher */
      launcherTitle: 'Launch console',
      launcherSubtitle: 'Register the services, systems, and scripts on this disk, then start any of them with one click. Group several of them into a scene and start it in order.',
      hint: 'Registrations are stored in a local state file and survive restarts.',
      stateFile: 'State file',
      addService: 'Add service',
      addScene: 'New scene',
      services: 'Services',
      scenes: 'Scenes',
      defaultGroup: 'Default group',
      empty: 'No services yet. Fill in a command and a working directory, then start it from here.',
      emptyScenes: 'No scenes yet. Put several services into one scene to start them in order.',
      name: 'Name',
      group: 'Group',
      command: 'Command',
      commandHint: 'One command line, such as npm run dev, start.bat, or python app.py',
      cwd: 'Working directory',
      cwdHint: 'Leave empty to use the current working directory',
      openUrl: 'Open URL (optional)',
      openUrlHint: 'For example http://localhost:3000',
      pickDir: 'Choose folder',
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      output: 'Output',
      hideOutput: 'Hide output',
      edit: 'Edit',
      confirmDeleteService: 'Delete {name}? It is removed from every scene and a running process is stopped first.',
      confirmDeleteScene: 'Delete scene {name}? Services it started keep running.',
      statusRunning: 'Running',
      statusStopping: 'Stopping',
      statusStopped: 'Not started',
      statusExited: 'Exited',
      statusFailed: 'Failed to start',
      runScene: 'Start scene',
      stopScene: 'Stop this group',
      addStep: 'Add step',
      stepDelay: 'Delay',
      ms: 'ms',
      steps: 'Steps',
      sceneRunning: 'Starting the scene…',
      sceneFinished: 'Scene finished',
      sceneStopped: 'Scene stopped',
      sceneFailed: 'Scene interrupted',
      sceneBusyOther: 'Another scene is starting; wait for it to finish',
      sceneBusyHint: 'The scene is starting this group; wait for it to finish',
      selectService: 'Choose a service',
      noSteps: 'This scene has no steps yet',
      noCwd: 'No working directory',
      noOutput: '(no output yet)',
      logTruncated: 'Showing the latest output only',
      loading: 'Loading…',
      saved: 'Saved',
      savedNextStart: 'Saved; restart this service to apply it',
      pickerUnavailable: 'The folder picker is unavailable; type the path instead',
      newService: 'New service',
      newScene: 'New scene',
      stepStarted: 'Started',
      stepAlready: 'Already running',
      stepFailed: 'Failed',
      stepPending: 'Waiting',
      stepStarting: 'Starting',
      stepStopping: 'Stopping',
      stepStopped: 'Stopped by scene',
      stepSkipped: 'Skipped',
      unknownStep: 'Deleted service',
      startedAt: 'Started',
      exitCode: 'Exit code',
      needName: 'A name is required',
      needCommand: 'A command is required',
      needStep: 'Add at least one step',
      needServiceFirst: 'Register at least one service before building a scene',
      allServicesUsed: 'Every service is already in this scene',
      stopOnError: 'Stop when a step fails',
      editLiveHint: 'Running; changes apply after a restart',
      /* invoices */
      invoicesTitle: 'Invoice merge',
      invoicesSubtitle: 'Pick several invoice PDFs and get one file with two invoices per A4 side, in order, ready for duplex printing.',
      dropTitle: 'Drop invoice PDFs here, or',
      chooseFiles: 'Choose files',
      clearFiles: 'Clear',
      invoicesEmpty: 'No files chosen yet. Up to 60 files, 25MB each.',
      layoutLabel: 'Layout',
      layoutAuto: 'Auto',
      layoutSide: 'Side by side',
      layoutStack: 'Stacked',
      sizeLabel: 'Paper',
      sizePortrait: 'A4 portrait',
      sizeLandscape: 'A4 landscape',
      marginLabel: 'Margin',
      marginUnit: 'mm',
      cutLine: 'Draw a cut line between them',
      generate: 'Generate print file',
      generating: 'Generating…',
      resultSummary: 'Generated {pages} pages · {sheets} sheets (duplex) · {invoices} invoices',
      resultAutoLayout: 'auto chose {layout}',
      printHint: 'Print with duplex on the long edge; each side holds two invoices, already in upload order.',
      needFiles: 'Choose at least one invoice PDF first',
      onlyPdf: 'Only PDF files are supported; skipped: {names}',
      removeFile: 'Remove',
      moveUp: 'Move up',
      moveDown: 'Move down',
      invoicesFooter: 'Merging happens on this machine; nothing is uploaded.',
      settings: 'Settings',
      settingsTitle: 'Settings',
      settingsSubtitle: 'Paths stay on this machine; changes apply as soon as you save.',
      sectionLauncher: 'Launch console',
      sectionInvoices: 'Invoice merge',
      sectionBookmarks: 'Bookmarks',
      bookmarkFileLabel: 'List file (bookmarks.json)',
      bookmarkFileHint: 'Default: {path}. The file holds no passwords; those live in the host credential store.',
      stateFileLabel: 'State file (state.json)',
      stateFileHint: 'Default: {path}. Switching the file stops the services that are running.',
      openDirLabel: 'Default folder to open',
      openDirHint: 'Add from folder reads PDFs from here.',
      downloadDirLabel: 'Default save folder',
      downloadDirHint: 'Save to folder writes the generated PDF here.',
      useDefault: 'Use default',
      resetDone: 'Defaults restored',
      folderAdd: 'Add from folder',
      folderScanning: 'Reading the folder…',
      folderEmpty: 'No PDF files in this folder',
      folderAddSelected: 'Add selected ({count})',
      selectAll: 'Select all',
      saveToFolder: 'Save to folder',
      savedTo: 'Saved to',
      pathFile: 'on disk',
      download: 'Download',
      featureBookmarks: 'Bookmarks',
      featureBookmarksDesc: 'Keep office system addresses, accounts and the browser each one should open in, then open any of them with one click.',
      featureBookmarksMeta: 'Office systems · one click',
      bookmarksTitle: 'Bookmarks',
      bookmarksSubtitle: 'Save the address, account and preferred browser; passwords live in the host credential store, not in a plain config file.',
      addBookmark: 'Add bookmark',
      emptyBookmarks: 'No bookmarks yet. Fill in an address, account and browser, then press Open.',
      bookmarkName: 'Name',
      bookmarkUrl: 'URL',
      bookmarkUrlHint: 'Starts with http:// or https://',
      bookmarkUsername: 'User name',
      bookmarkPassword: 'Password',
      bookmarkPasswordKeep: 'A password is saved; leave empty to keep it',
      bookmarkPasswordEmpty: 'No password saved',
      passwordSavedShort: 'password saved',
      bookmarkBrowser: 'Open with',
      bookmarkCustomPath: 'Browser executable',
      browserSystem: 'System default browser',
      browserChrome: 'Chrome',
      browserEdge: 'Edge',
      browserFirefox: 'Firefox',
      browserBrave: 'Brave',
      browserCustom: 'Custom program',
      browserNotInstalled: ' (not installed)',
      copyPassword: 'Copy password',
      clearPassword: 'Clear the saved password',
      credentialsUnavailable: 'This environment has no credential service: the rest is saved, but passwords are not stored.',
      openedWith: 'Opened with {browser}',
      credentialCopied: 'Copied to the clipboard',
      aboutTitle: 'About',
      aboutName: 'Name',
      aboutVersion: 'Version',
      aboutAuthor: 'Author',
      aboutLicense: 'License',
      aboutDir: 'Plugin folder',
      signature: '“Wherever the heart finds peace, there is home.”',
      previewTitle: 'Preview',
      previewPages: '{count} pages',
      previewEmpty: 'Choose invoices and every generated page appears here.',
      previewBusy: 'Building the preview…',
      previewFailed: 'Preview failed: {reason}',
      previewUnavailable: 'This environment has no PDF rasterizer, so preview is unavailable; use Generate print file and print it from your PDF reader.',
      print: 'Print',
      printing: 'Preparing to print…',
      pageLabel: 'Page {page}',
      previewImageFailed: 'Some pages failed to render; retry or generate the file instead.',
      fileCount: '{count} selected',
    }

    /**
     * 拼出接口地址，兼容挂载在子路径下的部署。
     * @param {string} suffix 后缀，例如 /state。
     * @returns {string} 绝对地址。
     */
    function apiUrl(suffix) {
      const base = new URL(document.baseURI)
      let dir = base.pathname
      const slash = dir.lastIndexOf('/')
      dir = slash >= 0 ? dir.slice(0, slash + 1) : '/'
      if (!dir.endsWith('/')) dir = `${dir}/`
      return new URL(`${dir}api/office-magic-box${suffix}`, base.origin).toString()
    }

    /**
     * 调一次 JSON 接口。
     * @param {string} suffix 后缀。
     * @param {object} [init] fetch 选项。
     * @param {number} [timeoutMs] 超时时间。
     * @returns {Promise<any>} 解析后的 JSON。
     */
    async function call(suffix, init, timeoutMs = 5000) {
      const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined
      const response = await fetch(apiUrl(suffix), Object.assign({
        cache: 'no-store',
        credentials: 'same-origin',
        signal: timeout,
      }, init || {}))
      const body = await response.text()
      let payload = null
      try {
        payload = body ? JSON.parse(body) : null
      } catch {
        throw new Error(`接口返回了非 JSON 内容（${response.status}）`)
      }
      if (!response.ok || !payload || payload.ok === false) {
        const error = new Error((payload && payload.error) || `请求失败（${response.status}）`)
        error.state = payload && payload.state ? payload.state : null
        throw error
      }
      return payload
    }

    /**
     * 文案替换：把 {name} 之类的占位符换掉。
     * @param {string} template 模板。
     * @param {object} values 值。
     * @returns {string} 结果。
     */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
      ))
    }

    /**
     * 取错误消息。
     * @param {unknown} cause 异常。
     * @returns {string} 文案。
     */
    function reasonOf(cause) {
      return String((cause && cause.message) || cause)
    }

    /**
     * 文件大小可读化。
     * @param {number} bytes 字节。
     * @returns {string} 文案。
     */
    function humanSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    /**
     * 读文件为 base64（分块拼接，避免大文件爆栈）。
     * @param {File} file 文件。
     * @returns {Promise<string>} base64。
     */
    async function fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk))
      }
      return btoa(binary)
    }

    /**
     * 触发浏览器下载。
     * @param {Blob} blob 内容。
     * @param {string} filename 文件名。
     */
    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.rel = 'noopener'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    }

    /**
     * 把若干页图片送进系统打印对话框：隐藏 iframe + A4 逐页，走浏览器自带的打印对话框，
     * 用户在里面选打印机、双面等选项。
     * @param {string[]} urls 图片地址（按页顺序）。
     * @param {boolean} landscape 是否横向。
     * @returns {Promise<void>} 打印对话框交互后 resolve。
     */
    async function printImages(urls, landscape) {
      const frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
      frame.tabIndex = -1
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;background:transparent'
      document.body.appendChild(frame)
      const doc = frame.contentDocument
      if (!doc) {
        frame.remove()
        throw new Error('无法创建打印视图')
      }
      const pageWidth = landscape ? '297mm' : '210mm'
      const pageHeight = landscape ? '210mm' : '297mm'
      const markup = '<!doctype html><html><head><meta charset="utf-8"><style>'
        + '@page { size: ' + (landscape ? 'A4 landscape' : 'A4 portrait') + '; margin: 0 }'
        + 'html, body { margin: 0; padding: 0; background: #ffffff }'
        + 'img { display: block; width: ' + pageWidth + '; height: ' + pageHeight + '; object-fit: contain; page-break-after: always; break-after: page }'
        + 'img:last-child { page-break-after: auto; break-after: auto }'
        + '</style></head><body>'
        + urls.map(url => '<img src="' + url + '" alt="">').join('')
        + '</body></html>'
      doc.open()
      doc.write(markup)
      doc.close()
      await new Promise(resolve => {
        if (doc.readyState === 'complete') resolve()
        else frame.addEventListener('load', () => resolve(), { once: true })
      })
      await Promise.all(Array.from(doc.images || []).map(image => (image.complete ? Promise.resolve() : new Promise(resolve => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }))))
      let removed = false
      const cleanup = () => {
        if (removed) return
        removed = true
        setTimeout(() => frame.remove(), 500)
      }
      try {
        frame.contentWindow.focus()
        frame.contentWindow.print()
      } finally {
        setTimeout(cleanup, 60000)
        try {
          frame.contentWindow.addEventListener('afterprint', cleanup)
        } catch {
          // 某些环境下拿不到 afterprint，靠超时兜底。
        }
      }
    }

    /**
     * 从 content-disposition 里取文件名。
     * @param {string | null} header 响应头。
     * @returns {string} 文件名。
     */
    function filenameFrom(header) {
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(String(header || ''))
      if (!match) return 'invoice-merged.pdf'
      try {
        return decodeURIComponent(match[1].replace(/"/g, ''))
      } catch {
        return match[1].replace(/"/g, '')
      }
    }

    const CSS = `
.omb-page { box-sizing: border-box; min-height: 100%; overflow: auto; padding: 32px 40px 56px; background: #ffffff; color: #18181b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
.omb-shell { max-width: 1180px; margin: 0 auto; }
.omb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.omb-head-main { min-width: 0; }
.omb-title { margin: 0; color: #09090b; font-size: 22px; line-height: 30px; font-weight: 600; letter-spacing: -0.01em; }
.omb-subtitle { margin: 6px 0 0; max-width: 760px; color: #71717a; font-size: 13px; }
.omb-head-actions { display: flex; flex: none; align-items: center; gap: 8px; }
.omb-crumb { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; color: #a1a1aa; font-size: 12px; }
.omb-crumb-sep { color: #d4d4d8; }
.omb-crumb-current { color: #3f3f46; font-weight: 500; }
.omb-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 26px; }
@media (max-width: 880px) { .omb-cards { grid-template-columns: minmax(0, 1fr); } }
.omb-fcard { display: flex; align-items: flex-start; gap: 14px; padding: 18px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color 0.12s ease, box-shadow 0.12s ease; }
.omb-fcard:hover { border-color: #d4d4d8; box-shadow: 0 2px 10px rgba(16, 24, 40, 0.07); }
.omb-fcard:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
.omb-fcard-icon { display: flex; flex: none; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid #e5e7eb; border-radius: 9px; background: #fafafa; color: #3f3f46; }
.omb-fcard-body { display: flex; flex: 1 1 auto; flex-direction: column; gap: 4px; min-width: 0; }
.omb-fcard-title { color: #09090b; font-size: 14px; font-weight: 600; }
.omb-fcard-desc { color: #71717a; font-size: 12.5px; }
.omb-fcard-meta { margin-top: 4px; color: #a1a1aa; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.omb-fcard-arrow { flex: none; margin-left: 4px; color: #a1a1aa; font-size: 13px; }
.omb-grid { display: grid; grid-template-columns: 5fr 7fr; gap: 32px; align-items: start; margin-top: 24px; }
@media (max-width: 900px) { .omb-grid { grid-template-columns: minmax(0, 1fr); gap: 24px; } }
.omb-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.omb-section-head { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.omb-h2 { margin: 0; color: #09090b; font-size: 14px; font-weight: 600; }
.omb-count { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px; background: #f4f4f5; color: #71717a; font-size: 11px; font-variant-numeric: tabular-nums; }
.omb-spacer { flex: 1 1 auto; }
.omb-group-key { margin-top: 4px; color: #a1a1aa; font-size: 11.5px; letter-spacing: 0.02em; }
.omb-list { display: flex; flex-direction: column; gap: 10px; }
.omb-card { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
.omb-card-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.omb-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #d4d4d8; }
.omb-dot--success { background: #10b981; }
.omb-dot--warn { background: #f59e0b; }
.omb-dot--error { background: #ef4444; }
.omb-name { flex: 0 1 auto; min-width: 0; max-width: 62%; overflow: hidden; color: #18181b; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.omb-status { flex: none; color: #71717a; font-size: 11.5px; }
.omb-card-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; }
.omb-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.omb-mono { display: inline-block; max-width: 100%; overflow: hidden; padding: 2px 7px; border: 1px solid #f0f0f1; border-radius: 6px; background: #fafafa; color: #52525b; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 11.5px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.omb-mono--muted { color: #a1a1aa; }
.omb-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #3f3f46; font: inherit; font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease; }
.omb-btn--sm { height: 28px; padding: 0 10px; border-radius: 7px; font-size: 12px; }
.omb-btn--outline { border-color: #e5e7eb; background: #ffffff; color: #3f3f46; }
.omb-btn--outline:hover:not(:disabled) { border-color: #d4d4d8; background: #fafafa; }
.omb-btn--solid { border-color: #18181b; background: #18181b; color: #fafafa; }
.omb-btn--solid:hover:not(:disabled) { border-color: #27272a; background: #27272a; }
.omb-btn--danger { color: #dc2626; }
.omb-btn--danger:hover:not(:disabled) { background: #fef2f2; }
.omb-btn--soft { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.omb-btn--soft:hover:not(:disabled) { border-color: #fca5a5; background: #fee2e2; }
.omb-btn:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
.omb-btn:disabled { opacity: 0.45; cursor: default; }
.omb-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.omb-step { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; color: #52525b; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 11.5px; }
.omb-step-index { color: #a1a1aa; }
.omb-step--error { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.omb-step--success { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
.omb-arrow { color: #d4d4d8; font-size: 11px; line-height: 1; }
.omb-progress { color: #71717a; font-size: 11.5px; }
.omb-logwrap { display: flex; flex-direction: column; gap: 6px; }
.omb-log { max-height: 190px; margin: 0; padding: 10px 12px; overflow: auto; border: 1px solid #f0f0f1; border-radius: 8px; background: #fafafa; color: #3f3f46; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
.omb-note { color: #a1a1aa; font-size: 11px; }
.omb-form { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
.omb-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.omb-label { color: #71717a; font-size: 11.5px; }
.omb-field-error { color: #dc2626; font-size: 11.5px; }
.omb-input { box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; color: #18181b; font: inherit; font-size: 12.5px; }
.omb-input:focus { border-color: #a1a1aa; outline: none; box-shadow: 0 0 0 3px rgba(24, 24, 27, 0.06); }
.omb-row { display: flex; align-items: flex-end; gap: 8px; min-width: 0; }
.omb-row--center { align-items: center; }
.omb-row > .omb-field { flex: 1 1 0; }
.omb-row > .omb-input { flex: 1 1 auto; }
.omb-row > .omb-input--narrow { flex: 0 0 92px; }
.omb-form-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.omb-check { display: inline-flex; align-items: center; gap: 6px; color: #52525b; font-size: 12px; }
.omb-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 20px; border: 1px dashed #e5e7eb; border-radius: 10px; background: #fafafa; color: #71717a; font-size: 12.5px; }
.omb-empty p { margin: 0; }
.omb-bars { display: flex; flex-direction: column; gap: 8px; margin: 16px 0 0; }
.omb-bar { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; }
.omb-bar-text { flex: 1 1 auto; min-width: 0; }
.omb-bar--error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
.omb-bar--notice { border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d; }
.omb-bar--ask { border: 1px solid #e5e7eb; background: #fafafa; color: #18181b; }
.omb-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #f0f0f1; color: #a1a1aa; font-size: 11.5px; }
.omb-muted { color: #a1a1aa; }
.omb-narrow { max-width: 860px; }
.omb-stack { display: flex; flex-direction: column; gap: 14px; margin-top: 24px; }
.omb-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 18px; border: 1px dashed #d4d4d8; border-radius: 12px; background: #fafafa; color: #71717a; font-size: 12.5px; text-align: center; transition: border-color 0.12s ease, background-color 0.12s ease; }
.omb-drop--over { border-color: #18181b; background: #f4f4f5; }
.omb-drop-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
.omb-files { display: flex; flex-direction: column; gap: 8px; }
.omb-file { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); }
.omb-file-index { flex: none; width: 22px; color: #a1a1aa; font-size: 11.5px; font-variant-numeric: tabular-nums; text-align: right; }
.omb-file-name { flex: 1 1 auto; min-width: 0; overflow: hidden; color: #18181b; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.omb-file-size { flex: none; color: #a1a1aa; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.omb-file-actions { display: flex; flex: none; gap: 4px; }
.omb-opts { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fafafa; }
.omb-opt { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.omb-seg { display: inline-flex; padding: 2px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; }
.omb-seg-btn { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: #52525b; font: inherit; font-size: 12px; cursor: pointer; }
.omb-seg-btn--on { background: #18181b; color: #fafafa; }
.omb-seg-btn:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 1px; }
.omb-send { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.omb-result { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 14px; border: 1px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; color: #15803d; font-size: 12.5px; }
.omb-preview { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fafafa; }
.omb-preview-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.omb-pages { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 4px 0 6px; }
.omb-page-shot { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 400px; }
.omb-shot { display: block; width: 100%; aspect-ratio: 210 / 297; border: 1px solid #e5e7eb; border-radius: 2px; background: #ffffff; box-shadow: 0 1px 3px rgba(16, 24, 40, 0.08); object-fit: contain; }
.omb-shot--land { aspect-ratio: 297 / 210; }
.omb-skel { background: #f4f4f5; border-style: dashed; box-shadow: none; }
.omb-shot-label { color: #a1a1aa; font-size: 11px; text-align: center; }
.omb-ver { display: inline-flex; align-items: center; height: 20px; margin-left: 8px; padding: 0 7px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fafafa; color: #a1a1aa; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 11px; vertical-align: middle; }
.omb-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
.omb-settings { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
.omb-section-block { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
.omb-section-title { margin: 0; color: #09090b; font-size: 13px; font-weight: 600; }
.omb-path-row { display: flex; align-items: flex-end; gap: 8px; }
.omb-path-row > .omb-field { flex: 1 1 auto; }
.omb-path-row > .omb-btn { flex: none; }
.omb-picker { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fafafa; }
.omb-picker-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.omb-picker-list { display: flex; flex-direction: column; max-height: 260px; overflow: auto; border: 1px solid #f0f0f1; border-radius: 8px; background: #ffffff; }
.omb-picker-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #f6f6f7; font-size: 12.5px; }
.omb-picker-row:last-child { border-bottom: 0; }
.omb-picker-row input { margin: 0; }
.omb-picker-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.omb-picker-size { flex: none; color: #a1a1aa; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.omb-saved { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 14px; border: 1px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; color: #15803d; font-size: 12.5px; }
.omb-saved .omb-mono { background: #ffffff; border-color: #cbead7; color: #15803d; }
.omb-kv { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 7px 14px; align-items: baseline; margin: 0; font-size: 12.5px; }
.omb-kv dt { color: #a1a1aa; }
.omb-kv dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3f3f46; }
.omb-bm-user { flex: 0 0 auto; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #71717a; font-size: 11.5px; }
.omb-bm-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.omb-bm-form > .omb-field--full { grid-column: 1 / -1; }
@media (max-width: 720px) { .omb-bm-form { grid-template-columns: minmax(0, 1fr); } }
`

    /**
     * 页面样式，随组件卸载一起移除。
     * @returns {object} React 元素。
     */
    function Styles() {
      return h('style', null, CSS)
    }

    /**
     * 通用按钮。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function Btn(props) {
      const solid = props.variant === 'primary' || props.variant === 'solid'
      const classes = ['omb-btn']
      if (props.size === 'sm') classes.push('omb-btn--sm')
      if (solid) classes.push('omb-btn--solid')
      else if (props.tone === 'danger') classes.push('omb-btn--danger')
      else if (props.tone === 'soft') classes.push('omb-btn--soft')
      else classes.push('omb-btn--outline')
      return h('button', {
        type: 'button',
        className: classes.join(' '),
        onClick: props.onClick,
        disabled: props.disabled === true,
        title: props.title || undefined,
      }, props.label)
    }

    /**
     * 表单字段。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function Field(props) {
      return h('label', { className: 'omb-field' },
        h('span', { className: 'omb-label' }, props.label),
        props.children,
        props.error ? h('span', { className: 'omb-field-error' }, props.error) : null,
        props.hint ? h('span', { className: 'omb-label' }, props.hint) : null,
      )
    }

    /**
     * 返回上级的导航条。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function Crumb(props) {
      return h('nav', { className: 'omb-crumb' },
        h(Btn, { size: 'sm', label: `← ${props.t('back')}`, onClick: props.onBack }),
        h('span', { className: 'omb-crumb-sep' }, '/'),
        h('span', { className: 'omb-crumb-current' }, props.current),
      )
    }

    /**
     * 状态点样式。
     * @param {string} status 状态。
     * @param {number|null} exitCode 退出码。
     * @returns {string} 类名。
     */
    function dotKind(status, exitCode) {
      if (status === 'running') return 'omb-dot--success'
      if (status === 'stopping') return 'omb-dot--warn'
      if (status === 'failed') return 'omb-dot--error'
      if (status === 'exited') return exitCode === 0 ? '' : 'omb-dot--error'
      return ''
    }

    /**
     * 服务状态文案。
     * @param {Function} t 翻译。
     * @param {object} service 服务快照。
     * @returns {string} 文案。
     */
    function statusText(t, service) {
      if (service.status === 'running') {
        return service.startedAt
          ? `${t('statusRunning')} · ${t('startedAt')} ${new Date(service.startedAt).toLocaleTimeString()}`
          : t('statusRunning')
      }
      if (service.status === 'stopping') return t('statusStopping')
      if (service.status === 'failed') return t('statusFailed')
      if (service.status === 'exited') {
        const code = service.exitCode === null || service.exitCode === undefined ? '-' : String(service.exitCode)
        return `${t('statusExited')} · ${t('exitCode')} ${code}`
      }
      return t('statusStopped')
    }

    /**
     * 场景步骤状态文案。
     * @param {Function} t 翻译。
     * @param {string} status 状态。
     * @returns {string} 文案。
     */
    function stepText(t, status) {
      if (status === 'started') return t('stepStarted')
      if (status === 'already-running') return t('stepAlready')
      if (status === 'failed') return t('stepFailed')
      if (status === 'starting') return t('stepStarting')
      if (status === 'stopping') return t('stepStopping')
      if (status === 'stopped-by-scene') return t('stepStopped')
      if (status === 'skipped') return t('stepSkipped')
      return t('stepPending')
    }

    /* ————————————————— 主页 ————————————————— */

    /**
     * 面板图标（左侧栏）。
     * @param {{ size?: number }} props 属性。
     * @returns {object} React 元素。
     */
    function PanelGlyph(props) {
      const size = props && props.size ? props.size : 18
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 3 }),
      h('path', { d: 'M3 9.2h18' }),
      h('path', { d: 'M6.6 6.8h.01M9.2 6.8h.01' }),
      h('path', { d: 'M10.4 12.6l4.2 2.4-4.2 2.4z', fill: 'currentColor', stroke: 'none' }),
      )
    }

    /**
     * 功能卡片。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function FeatureCard(props) {
      return h('button', {
        type: 'button',
        className: 'omb-fcard',
        onClick: props.onOpen,
      },
      h('span', { className: 'omb-fcard-icon', 'aria-hidden': true }, props.icon),
      h('span', { className: 'omb-fcard-body' },
        h('span', { className: 'omb-fcard-title' }, props.title),
        h('span', { className: 'omb-fcard-desc' }, props.description),
        h('span', { className: 'omb-fcard-meta' }, props.meta),
      ),
      h('span', { className: 'omb-fcard-arrow', 'aria-hidden': true }, '→'),
      )
    }

    /**
     * 主页。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function HomeView(props) {
      const { t, version } = props
      const [stats, setStats] = useState(null)

      useEffect(() => {
        let alive = true
        call('/state')
          .then(next => {
            if (alive) setStats({ services: next.services.length, scenes: next.scenes.length })
          })
          .catch(() => {
            if (alive) setStats(null)
          })
        return () => {
          alive = false
        }
      }, [])

      const launcherMeta = stats
        ? fill(t('featureLauncherMeta'), { services: stats.services, scenes: stats.scenes })
        : stats === null
          ? t('loading')
          : t('featureLauncherMetaEmpty')

      return h('div', null,
        h('header', { className: 'omb-head' },
          h('div', { className: 'omb-head-main' },
            h('div', { className: 'omb-title-row' },
              h('h1', { className: 'omb-title' }, t('title')),
              version ? h('span', { className: 'omb-ver', title: `office-magic-box v${version}` }, `v${version}`) : null,
            ),
            h('p', { className: 'omb-subtitle' }, t('subtitle')),
          ),
          h('div', { className: 'omb-head-actions' },
            h(Btn, { label: t('settings'), onClick: () => props.onOpen('settings') }),
          ),
        ),
        h('div', { className: 'omb-cards' },
          h(FeatureCard, {
            key: 'launcher',
            icon: h('svg', {
              viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
              strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
            },
            h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 3 }),
            h('path', { d: 'M3 9.2h18' }),
            h('path', { d: 'M10.4 12.6l4.2 2.4-4.2 2.4z', fill: 'currentColor', stroke: 'none' }),
            ),
            title: t('featureLauncher'),
            description: t('featureLauncherDesc'),
            meta: launcherMeta,
            onOpen: () => props.onOpen('launcher'),
          }),
          h(FeatureCard, {
            key: 'invoices',
            icon: h('svg', {
              viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
              strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
            },
            h('path', { d: 'M6 3.5h8.5L19 8v12.5H6z' }),
            h('path', { d: 'M14 3.5V8h5' }),
            h('path', { d: 'M9 12.5h3.2M9 16h6.5' }),
            ),
            title: t('featureInvoices'),
            description: t('featureInvoicesDesc'),
            meta: t('featureInvoicesMeta'),
            onOpen: () => props.onOpen('invoices'),
          }),
          h(FeatureCard, {
            key: 'bookmarks',
            icon: h('svg', {
              viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
              strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
            },
            h('path', { d: 'M6.5 3.5h11v17l-5.5-4-5.5 4z' }),
            ),
            title: t('featureBookmarks'),
            description: t('featureBookmarksDesc'),
            meta: t('featureBookmarksMeta'),
            onOpen: () => props.onOpen('bookmarks'),
          }),
        ),
        h('footer', { className: 'omb-foot' },
          h('span', null, t('homeFooter')),
          version ? h('span', { className: 'omb-ver' }, `v${version}`) : null,
        ),
      )
    }

    /* ————————————————— 设置 ————————————————— */

    /**
     * 把目录拼成 state.json 的完整路径（按路径里的分隔符风格）。
     * @param {string} dir 目录。
     * @returns {string} 文件路径。
     */
    function stateFileIn(dir) {
      const trimmed = String(dir || '').replace(/[\\/]+$/, '')
      if (!trimmed) return ''
      const separator = trimmed.includes('\\') ? '\\' : '/'
      return `${trimmed}${separator}state.json`
    }

    /**
     * 把目录拼成 bookmarks.json 的完整路径。
     * @param {string} dir 目录。
     * @returns {string} 文件路径。
     */
    function bookmarkFileIn(dir) {
      const trimmed = String(dir || '').replace(/[\\/]+$/, '')
      if (!trimmed) return ''
      const separator = trimmed.includes('\\') ? '\\' : '/'
      return `${trimmed}${separator}bookmarks.json`
    }

    /**
     * 设置页。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function SettingsView(props) {
      const { t, config, pickDirectory } = props
      const settings = config && config.settings ? config.settings : null
      const [stateFile, setStateFile] = useState('')
      const [openDir, setOpenDir] = useState('')
      const [downloadDir, setDownloadDir] = useState('')
      const [bookmarkFile, setBookmarkFile] = useState('')
      const [busy, setBusy] = useState(false)
      const [picking, setPicking] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')

      useEffect(() => {
        if (!settings) return
        setStateFile(settings.stateFile || '')
        setOpenDir(settings.openDir || '')
        setDownloadDir(settings.downloadDir || '')
        setBookmarkFile(settings.bookmarkFile || '')
      }, [config])

      useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(''), NOTICE_MS)
        return () => clearTimeout(timer)
      }, [notice])

      const submit = async patch => {
        setBusy(true)
        setError('')
        setNotice('')
        try {
          const payload = await call('/settings', { method: 'POST', body: JSON.stringify(patch) }, 20000)
          props.onSaved(payload)
          setNotice(t('saved'))
        } catch (cause) {
          setError(reasonOf(cause))
        } finally {
          setBusy(false)
        }
      }

      const save = () => submit({
        launcher: { stateFile },
        bookmarks: { file: bookmarkFile },
        invoices: { openDir, downloadDir },
      })

      const reset = async () => {
        setStateFile('')
        setOpenDir('')
        setDownloadDir('')
        setBookmarkFile('')
        await submit({ launcher: { stateFile: '' }, bookmarks: { file: '' }, invoices: { openDir: '', downloadDir: '' } })
        setNotice(t('resetDone'))
      }

      const pickDir = async (field, apply) => {
        if (!pickDirectory || picking) return
        setPicking(field)
        try {
          const picked = await pickDirectory()
          if (picked.ok && picked.path) apply(picked.path)
          else if (!picked.ok && picked.reason && picked.reason !== 'unavailable') setError(picked.reason)
        } finally {
          setPicking('')
        }
      }

      const defaults = settings ? settings.defaults : { stateFile: '', bookmarkFile: '', openDir: '', downloadDir: '' }

      return h('div', null,
        h(Crumb, { t, onBack: props.onBack, current: t('settingsTitle') }),
        h('header', { className: 'omb-head' },
          h('div', { className: 'omb-head-main' },
            h('div', { className: 'omb-title-row' },
              h('h1', { className: 'omb-title' }, t('settingsTitle')),
              config && config.version ? h('span', { className: 'omb-ver' }, `v${config.version}`) : null,
            ),
            h('p', { className: 'omb-subtitle' }, t('settingsSubtitle')),
          ),
        ),
        error || notice
          ? h('div', { className: 'omb-bars' },
            error
              ? h('div', { className: 'omb-bar omb-bar--error', role: 'alert' },
                h('span', { className: 'omb-bar-text' }, error),
                h(Btn, { size: 'sm', label: t('dismiss'), onClick: () => setError('') }),
              )
              : null,
            notice
              ? h('div', { className: 'omb-bar omb-bar--notice', role: 'status', 'aria-live': 'polite' },
                h('span', { className: 'omb-bar-text' }, notice),
              )
              : null,
          )
          : null,
        h('div', { className: 'omb-narrow omb-settings' },
          h('section', { className: 'omb-section-block' },
            h('h2', { className: 'omb-section-title' }, t('sectionLauncher')),
            h('div', { className: 'omb-path-row' },
              h(Field, {
                label: t('stateFileLabel'),
                hint: fill(t('stateFileHint'), { path: defaults.stateFile }),
              },
              h('input', {
                className: 'omb-input',
                value: stateFile,
                spellCheck: false,
                placeholder: defaults.stateFile,
                onChange: event => setStateFile(event.target.value),
              }),
              ),
              h(Btn, {
                label: t('pickDir'),
                disabled: Boolean(picking),
                onClick: () => pickDir('stateFile', dir => setStateFile(stateFileIn(dir))),
              }),
            ),
          ),
          h('section', { className: 'omb-section-block' },
            h('h2', { className: 'omb-section-title' }, t('sectionBookmarks')),
            h('div', { className: 'omb-path-row' },
              h(Field, {
                label: t('bookmarkFileLabel'),
                hint: fill(t('bookmarkFileHint'), { path: defaults.bookmarkFile }),
              },
              h('input', {
                className: 'omb-input',
                value: bookmarkFile,
                spellCheck: false,
                placeholder: defaults.bookmarkFile,
                onChange: event => setBookmarkFile(event.target.value),
              }),
              ),
              h(Btn, {
                label: t('pickDir'),
                disabled: Boolean(picking),
                onClick: () => pickDir('bookmarkFile', dir => setBookmarkFile(bookmarkFileIn(dir))),
              }),
            ),
          ),
          h('section', { className: 'omb-section-block' },
            h('h2', { className: 'omb-section-title' }, t('sectionInvoices')),
            h('div', { className: 'omb-path-row' },
              h(Field, { label: t('openDirLabel'), hint: t('openDirHint') },
                h('input', {
                  className: 'omb-input',
                  value: openDir,
                  spellCheck: false,
                  placeholder: defaults.openDir,
                  onChange: event => setOpenDir(event.target.value),
                }),
              ),
              h(Btn, {
                label: t('pickDir'),
                disabled: Boolean(picking),
                onClick: () => pickDir('openDir', dir => setOpenDir(dir)),
              }),
            ),
            h('div', { className: 'omb-path-row' },
              h(Field, { label: t('downloadDirLabel'), hint: t('downloadDirHint') },
                h('input', {
                  className: 'omb-input',
                  value: downloadDir,
                  spellCheck: false,
                  placeholder: defaults.downloadDir,
                  onChange: event => setDownloadDir(event.target.value),
                }),
              ),
              h(Btn, {
                label: t('pickDir'),
                disabled: Boolean(picking),
                onClick: () => pickDir('downloadDir', dir => setDownloadDir(dir)),
              }),
            ),
          ),
          h('div', { className: 'omb-form-actions' },
            h(Btn, { label: t('useDefault'), onClick: reset, disabled: busy }),
            h(Btn, { label: t('save'), variant: 'solid', disabled: busy, onClick: save }),
          ),
          config
            ? h('section', { className: 'omb-section-block' },
              h('h2', { className: 'omb-section-title' }, t('aboutTitle')),
              h('dl', { className: 'omb-kv' },
                h('dt', null, t('aboutName')),
                h('dd', null, config.plugin && config.plugin.name ? config.plugin.name : '—'),
                h('dt', null, t('aboutVersion')),
                h('dd', null, config.version ? `v${config.version}` : '—'),
                h('dt', null, t('aboutAuthor')),
                h('dd', null, config.author || '—'),
                h('dt', null, t('aboutLicense')),
                h('dd', null, config.license || '—'),
                h('dt', null, t('aboutDir')),
                h('dd', null, config.plugin && config.plugin.dir
                  ? h('code', { className: 'omb-mono', title: config.plugin.dir }, config.plugin.dir)
                  : '—'),
              ),
              h('p', { className: 'omb-note' }, t('signature')),
            )
            : null,
        ),
      )
    }

    /* ————————————————— 启动中控台 ————————————————— */

    /**
     * 单个服务卡片。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function ServiceRow(props) {
      const { t, service, locked, logOpen } = props
      const live = service.status === 'running' || service.status === 'stopping'
      const logref = useRef(null)
      const [pinned, setPinned] = useState(true)
      const log = logOpen ? service.log || '' : ''

      useEffect(() => {
        const element = logref.current
        if (!element || !pinned) return
        element.scrollTop = element.scrollHeight
      }, [log, pinned])

      useEffect(() => {
        if (logOpen) setPinned(true)
      }, [logOpen])

      const detail = service.error && service.status === 'failed'
        ? `${statusText(t, service)} · ${service.error}`
        : statusText(t, service)

      const actions = h('div', { className: 'omb-card-actions' },
        live
          ? h(Btn, { size: 'sm', label: t('stop'), tone: 'soft', disabled: locked, title: props.lockHint, onClick: () => props.onStop(service) })
          : h(Btn, { size: 'sm', label: t('start'), variant: 'solid', disabled: locked, title: props.lockHint, onClick: () => props.onStart(service) }),
        live
          ? h(Btn, { size: 'sm', label: t('restart'), disabled: locked, title: props.lockHint, onClick: () => props.onRestart(service) })
          : null,
        service.openUrl ? h(Btn, { size: 'sm', label: t('open'), onClick: () => props.onOpen(service) }) : null,
        h(Btn, {
          size: 'sm',
          label: t('edit'),
          disabled: locked,
          title: locked ? props.lockHint : live ? t('editLiveHint') : undefined,
          onClick: () => props.onEdit(service),
        }),
        h(Btn, { size: 'sm', label: logOpen ? t('hideOutput') : t('output'), onClick: () => props.onToggleLog(service) }),
        h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', disabled: locked, title: props.lockHint, onClick: () => props.onDelete(service) }),
      )

      return h('article', { className: 'omb-card' },
        h('div', { className: 'omb-card-title' },
          h('span', { className: `omb-dot ${dotKind(service.status, service.exitCode)}`, title: detail }),
          h('span', { className: 'omb-name', title: service.name }, service.name),
          h('span', { className: 'omb-status', title: detail }, detail),
          actions,
        ),
        h('div', { className: 'omb-meta' },
          h('code', { className: 'omb-mono', title: service.command || '' }, service.command || '—'),
          h('code', {
            className: `omb-mono${service.cwd ? '' : ' omb-mono--muted'}`,
            title: service.cwd || '',
          }, service.cwd || t('noCwd')),
        ),
        logOpen
          ? h('div', { className: 'omb-logwrap' },
            service.logTruncated ? h('span', { className: 'omb-note' }, t('logTruncated')) : null,
            h('pre', {
              className: 'omb-log',
              ref: logref,
              onScroll: event => {
                const element = event.currentTarget
                setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 16)
              },
            }, log || t('noOutput')),
          )
          : null,
      )
    }

    /**
     * 服务表单。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function ServiceForm(props) {
      const { t, draft, busy, picking, errors = {} } = props
      const set = (key, value) => {
        props.onClearError(key)
        props.onChange(Object.assign({}, draft, { [key]: value }))
      }
      return h('div', { className: 'omb-form' },
        h('div', { className: 'omb-row' },
          h(Field, { label: t('name'), error: errors.name },
            h('input', {
              className: 'omb-input',
              value: draft.name || '',
              placeholder: t('newService'),
              onChange: event => set('name', event.target.value),
            }),
          ),
          h(Field, { label: t('group') },
            h('input', {
              className: 'omb-input',
              value: draft.group || '',
              placeholder: t('defaultGroup'),
              onChange: event => set('group', event.target.value),
            }),
          ),
        ),
        h(Field, { label: t('command'), hint: t('commandHint'), error: errors.command },
          h('input', {
            className: 'omb-input',
            value: draft.command || '',
            spellCheck: false,
            onChange: event => set('command', event.target.value),
          }),
        ),
        h(Field, { label: t('cwd'), hint: t('cwdHint') },
          h('div', { className: 'omb-row' },
            h('input', {
              className: 'omb-input',
              value: draft.cwd || '',
              spellCheck: false,
              onChange: event => set('cwd', event.target.value),
            }),
            h(Btn, {
              label: t('pickDir'),
              disabled: picking,
              onClick: async () => {
                try {
                  const picked = await props.onPickDirectory()
                  if (picked && picked.path) set('cwd', picked.path)
                } catch (cause) {
                  props.onError(reasonOf(cause))
                }
              },
            }),
          ),
        ),
        h(Field, { label: t('openUrl'), hint: t('openUrlHint') },
          h('input', {
            className: 'omb-input',
            value: draft.openUrl || '',
            spellCheck: false,
            onChange: event => set('openUrl', event.target.value),
          }),
        ),
        h('div', { className: 'omb-form-actions' },
          h(Btn, { label: t('cancel'), onClick: props.onCancel }),
          h(Btn, { label: t('save'), variant: 'solid', disabled: busy, onClick: props.onSave }),
        ),
      )
    }

    /**
     * 场景表单。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function SceneForm(props) {
      const { t, draft, services, busy, error } = props
      const set = (key, value) => props.onChange(Object.assign({}, draft, { [key]: value }))
      const steps = draft.steps || []
      const used = new Set(steps.map(step => step.serviceId))
      const nameOf = id => {
        const found = services.find(service => service.id === id)
        return found ? found.name : t('unknownStep')
      }
      const updateStep = (index, patch) => {
        if (patch.serviceId && steps.some((step, at) => at !== index && step.serviceId === patch.serviceId)) {
          props.onError(t('allServicesUsed'))
          return
        }
        const next = steps.slice()
        next[index] = Object.assign({}, next[index], patch)
        set('steps', next)
      }
      const move = (index, delta) => {
        const target = index + delta
        if (target < 0 || target >= steps.length) return
        const next = steps.slice()
        const swapped = next[target]
        next[target] = next[index]
        next[index] = swapped
        set('steps', next)
      }
      return h('div', { className: 'omb-form' },
        h(Field, { label: t('name'), error: error },
          h('input', {
            className: 'omb-input',
            value: draft.name || '',
            placeholder: t('newScene'),
            onChange: event => set('name', event.target.value),
          }),
        ),
        h('span', { className: 'omb-label' }, t('steps')),
        steps.length === 0 ? h('p', { className: 'omb-muted' }, t('noSteps')) : null,
        steps.map((step, index) => h('div', { className: 'omb-row omb-row--center', key: `${index}-${step.serviceId}` },
          h('span', { className: 'omb-count' }, String(index + 1)),
          h('select', {
            className: 'omb-input',
            value: step.serviceId || '',
            onChange: event => updateStep(index, { serviceId: event.target.value }),
          },
          h('option', { value: '' }, t('selectService')),
          services.map(service => h('option', {
            key: service.id,
            value: service.id,
            disabled: used.has(service.id) && service.id !== step.serviceId,
          }, service.name)),
          ),
          h('input', {
            className: 'omb-input omb-input--narrow',
            value: String(step.delayMs === undefined ? 800 : step.delayMs),
            title: `${t('stepDelay')} (${t('ms')})`,
            onChange: event => updateStep(index, { delayMs: Number(event.target.value.replace(/[^0-9]/g, '') || 0) }),
          }),
          h('span', { className: 'omb-label' }, t('ms')),
          h(Btn, { size: 'sm', label: '↑', disabled: index === 0, onClick: () => move(index, -1) }),
          h(Btn, { size: 'sm', label: '↓', disabled: index === steps.length - 1, onClick: () => move(index, 1) }),
          h(Btn, {
            size: 'sm',
            label: t('delete'),
            tone: 'danger',
            onClick: () => set('steps', steps.filter((item, at) => at !== index)),
          }),
        )),
        h('label', { className: 'omb-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.stopOnError !== false,
            onChange: event => set('stopOnError', event.target.checked),
          }),
          t('stopOnError'),
        ),
        h('div', { className: 'omb-form-actions' },
          h(Btn, {
            label: t('addStep'),
            onClick: () => {
              const free = services.find(service => !used.has(service.id))
              if (!free) {
                props.onError(t('allServicesUsed'))
                return
              }
              set('steps', steps.concat([{ serviceId: free.id, delayMs: 800 }]))
            },
          }),
          h('span', { className: 'omb-spacer' }),
          h(Btn, { label: t('cancel'), onClick: props.onCancel }),
          h(Btn, { label: t('save'), variant: 'solid', disabled: busy, onClick: props.onSave }),
        ),
        steps.length === 0 ? null : h('span', { className: 'omb-label' }, steps.map(step => nameOf(step.serviceId)).join(' → ')),
      )
    }

    /**
     * 场景卡片。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function SceneCard(props) {
      const { t, scene, services, run, busy } = props
      const names = new Map(services.map(service => [service.id, service.name]))
      const statusOf = id => {
        const found = services.find(service => service.id === id)
        return found ? found.status : 'stopped'
      }
      const mine = run && run.sceneId === scene.id ? run : null
      const otherRunning = Boolean(run && run.running && run.sceneId !== scene.id)
      const canStop = Boolean(mine) && mine.steps.some(step => statusOf(step.serviceId) === 'running')
      const startedCount = mine
        ? mine.steps.filter(step => step.status === 'started' || step.status === 'already-running').length
        : 0
      const phase = !mine
        ? ''
        : mine.running
          ? t('sceneRunning')
          : mine.stopped
            ? t('sceneStopped')
            : mine.error
              ? t('sceneFailed')
              : t('sceneFinished')
      const actions = h('div', { className: 'omb-card-actions' },
        h(Btn, {
          size: 'sm',
          label: t('runScene'),
          variant: 'solid',
          disabled: busy || otherRunning || mine?.running === true,
          title: otherRunning ? t('sceneBusyOther') : undefined,
          onClick: () => props.onRun(scene),
        }),
        h(Btn, { size: 'sm', label: t('stopScene'), tone: 'soft', disabled: !canStop, onClick: () => props.onStop(scene) }),
        h(Btn, { size: 'sm', label: t('edit'), disabled: busy || mine?.running === true, onClick: () => props.onEdit(scene) }),
        h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', disabled: busy || mine?.running === true, onClick: () => props.onDelete(scene) }),
      )

      return h('article', { className: 'omb-card' },
        h('div', { className: 'omb-card-title' },
          h('span', { className: 'omb-name', title: scene.name }, scene.name),
          h('span', { className: 'omb-count' }, `${t('steps')} ${scene.steps.length}`),
          actions,
        ),
        h('div', { className: 'omb-flow' },
          scene.steps.map((step, index) => [
            index > 0 ? h('span', { key: `arrow-${index}`, className: 'omb-arrow', 'aria-hidden': true }, '→') : null,
            h('span', {
              key: `${index}-${step.serviceId}`,
              className: 'omb-step',
              title: names.get(step.serviceId) || t('unknownStep'),
            },
            h('span', { className: 'omb-step-index' }, `${index + 1}`),
            names.get(step.serviceId) || t('unknownStep'),
            h('span', { className: 'omb-step-index' }, `${step.delayMs}${t('ms')}`),
            ),
          ]),
        ),
        mine
          ? h('div', { className: 'omb-flow' },
            mine.steps.map((step, index) => {
              const kind = step.status === 'failed'
                ? 'omb-step--error'
                : step.status === 'started' || step.status === 'already-running'
                  ? 'omb-step--success'
                  : ''
              return h('span', {
                key: `${index}-${step.serviceId}`,
                className: `omb-step ${kind}`,
                title: step.message || step.name,
              },
              h('span', { className: 'omb-step-index' }, `${index + 1}`),
              step.name,
              stepText(t, step.status),
              )
            }),
          )
          : null,
        mine
          ? h('span', { className: 'omb-progress' }, `${phase} · ${startedCount}/${mine.steps.length}`)
          : null,
        otherRunning ? h('span', { className: 'omb-progress' }, t('sceneBusyOther')) : null,
      )
    }

    /**
     * 启动中控台。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function LauncherView(props) {
      const t = props.t
      const [data, setData] = useState(null)
      const [pollError, setPollError] = useState('')
      const [actionError, setActionError] = useState('')
      const [notice, setNotice] = useState('')
      const [busyTick, setBusyTick] = useState(0)
      const [serviceDraft, setServiceDraft] = useState(null)
      const [sceneDraft, setSceneDraft] = useState(null)
      const [formErrors, setFormErrors] = useState({})
      const [openLog, setOpenLog] = useState({})
      const [confirming, setConfirming] = useState(null)
      const [picking, setPicking] = useState(false)
      const busyRef = useRef(new Set())
      const isBusy = key => busyRef.current.has(key)
      const dataRef = useRef(null)
      dataRef.current = data

      const bumpBusy = useCallback(() => {
        setBusyTick(count => count + 1)
      }, [])

      const refresh = useCallback(async () => {
        try {
          const next = await call('/state')
          setData(next)
          setPollError('')
        } catch (cause) {
          setPollError(reasonOf(cause))
        }
      }, [])

      useEffect(() => {
        let alive = true
        let timer = null
        const sceneRunningNow = () => Boolean(dataRef.current && dataRef.current.sceneRun && dataRef.current.sceneRun.running)
        const tick = async () => {
          await refresh()
          if (!alive) return
          timer = setTimeout(tick, sceneRunningNow() ? POLL_ACTIVE_MS : POLL_MS)
        }
        tick()
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
        }
      }, [refresh])

      useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(''), NOTICE_MS)
        return () => clearTimeout(timer)
      }, [notice])

      const act = useCallback(async (body, key) => {
        const slot = key || body.action
        busyRef.current.add(slot)
        bumpBusy()
        try {
          const payload = await call('/act', { method: 'POST', body: JSON.stringify(body) })
          if (payload.state) setData(payload.state)
          setActionError('')
          return payload
        } catch (cause) {
          if (cause && cause.state) setData(cause.state)
          setActionError(reasonOf(cause))
          return null
        } finally {
          busyRef.current.delete(slot)
          bumpBusy()
        }
      }, [bumpBusy])

      const services = (data && data.services) || []
      const scenes = (data && data.scenes) || []
      const sceneRun = data ? data.sceneRun : null
      const lockedServiceIds = new Set(
        sceneRun && sceneRun.running ? sceneRun.steps.map(step => step.serviceId) : [],
      )

      const groups = useMemo(() => {
        const map = new Map()
        for (const service of services) {
          const key = service.group || t('defaultGroup')
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(service)
        }
        return Array.from(map.entries())
      }, [services, t])

      const pickDirectory = async () => {
        if (picking) return { ok: false, reason: 'busy' }
        setPicking(true)
        try {
          const workspace = props.pickDirectory ? await props.pickDirectory() : { ok: false, reason: 'unavailable' }
          if (!workspace.ok) {
            setActionError(workspace.reason && workspace.reason !== 'unavailable'
              ? `${t('pickerUnavailable')}：${workspace.reason}`
              : t('pickerUnavailable'))
          }
          return workspace
        } finally {
          setPicking(false)
        }
      }

      const startService = service => act({ action: 'service.start', id: service.id }, `service:${service.id}`)
      const stopService = service => act({ action: 'service.stop', id: service.id }, `service:${service.id}`)
      const restartService = service => act({ action: 'service.restart', id: service.id }, `service:${service.id}`)
      const openService = service => {
        if (!service.openUrl) return
        window.open(service.openUrl, '_blank', 'noopener')
      }
      const editService = service => {
        setFormErrors({})
        setServiceDraft({
          id: service.id,
          name: service.name,
          group: service.group,
          command: service.command,
          cwd: service.cwd,
          openUrl: service.openUrl,
        })
      }

      const saveServiceDraft = async () => {
        if (!serviceDraft) return
        const errors = {}
        if (!String(serviceDraft.name || '').trim()) errors.name = t('needName')
        if (!String(serviceDraft.command || '').trim()) errors.command = t('needCommand')
        setFormErrors(errors)
        if (Object.keys(errors).length > 0) return
        const running = services.some(service => service.id === serviceDraft.id && service.status === 'running')
        const payload = await act({
          action: 'service.save',
          id: serviceDraft.id || '',
          name: serviceDraft.name,
          group: serviceDraft.group,
          command: serviceDraft.command,
          cwd: serviceDraft.cwd,
          openUrl: serviceDraft.openUrl,
        }, 'service-form')
        if (payload) {
          setServiceDraft(null)
          setNotice(running ? t('savedNextStart') : t('saved'))
        }
      }

      const openSceneEditor = scene => {
        setFormErrors({})
        setSceneDraft({
          id: scene.id,
          name: scene.name,
          stopOnError: scene.stopOnError !== false,
          steps: scene.steps.map(step => ({ serviceId: step.serviceId, delayMs: step.delayMs })),
        })
      }

      const saveSceneDraft = async () => {
        if (!sceneDraft) return
        const errors = {}
        if (!String(sceneDraft.name || '').trim()) errors.name = t('needName')
        const steps = (sceneDraft.steps || []).filter(step => step.serviceId)
        if (steps.length === 0) errors.steps = t('needStep')
        setFormErrors(errors)
        if (Object.keys(errors).length > 0) return
        const payload = await act({
          action: 'scene.save',
          id: sceneDraft.id || '',
          name: sceneDraft.name,
          stopOnError: sceneDraft.stopOnError !== false,
          steps,
        }, 'scene-form')
        if (payload) {
          setSceneDraft(null)
          setNotice(t('saved'))
        }
      }

      const runScene = scene => act({ action: 'scene.run', id: scene.id }, `scene:${scene.id}`)
      const stopScene = scene => act({ action: 'scene.stop', id: scene.id }, `scene:${scene.id}`)
      const askDeleteService = service => setConfirming({ kind: 'service', id: service.id, name: service.name })
      const askDeleteScene = scene => setConfirming({ kind: 'scene', id: scene.id, name: scene.name })
      const confirmDelete = async () => {
        if (!confirming) return
        const target = confirming
        setConfirming(null)
        const payload = await act(
          { action: target.kind === 'service' ? 'service.delete' : 'scene.delete', id: target.id },
          `${target.kind}:${target.id}`,
        )
        if (payload) setNotice(t('saved'))
      }

      const serviceHead = h('div', { className: 'omb-section-head', key: 'head' },
        h('h2', { className: 'omb-h2' }, t('services')),
        h('span', { className: 'omb-count' }, String(services.length)),
        h('span', { className: 'omb-spacer' }),
        h(Btn, {
          label: t('addService'),
          variant: 'solid',
          onClick: () => {
            setFormErrors({})
            setServiceDraft({ id: '', name: '', group: '', command: '', cwd: '', openUrl: '' })
          },
        }),
      )
      const serviceNodes = []
      if (serviceDraft) {
        serviceNodes.push(h(ServiceForm, {
          key: 'form',
          t,
          draft: serviceDraft,
          busy: isBusy('service-form'),
          picking,
          errors: formErrors,
          onChange: setServiceDraft,
          onClearError: key => setFormErrors(previous => {
            if (!previous[key]) return previous
            const next = Object.assign({}, previous)
            delete next[key]
            return next
          }),
          onCancel: () => setServiceDraft(null),
          onSave: saveServiceDraft,
          onPickDirectory: pickDirectory,
          onError: setActionError,
        }))
      }
      if (!services.length && !serviceDraft && data) {
        serviceNodes.push(h('div', { className: 'omb-empty', key: 'empty' },
          h('p', null, t('empty')),
          h(Btn, {
            label: t('addService'),
            variant: 'solid',
            onClick: () => setServiceDraft({ id: '', name: '', group: '', command: '', cwd: '', openUrl: '' }),
          }),
        ))
      }
      for (const [group, items] of groups) {
        serviceNodes.push(h('div', { className: 'omb-group-key', key: `group-${group}` }, group))
        for (const service of items) {
          serviceNodes.push(h(ServiceRow, {
            key: service.id,
            t,
            service,
            locked: isBusy(`service:${service.id}`) || lockedServiceIds.has(service.id),
            lockHint: lockedServiceIds.has(service.id) ? t('sceneBusyHint') : undefined,
            logOpen: openLog[service.id] === true,
            onStart: startService,
            onStop: stopService,
            onRestart: restartService,
            onEdit: editService,
            onDelete: askDeleteService,
            onOpen: openService,
            onToggleLog: target => setOpenLog(previous => Object.assign({}, previous, {
              [target.id]: previous[target.id] !== true,
            })),
          }))
        }
      }

      const sceneHead = h('div', { className: 'omb-section-head', key: 'head' },
        h('h2', { className: 'omb-h2' }, t('scenes')),
        h('span', { className: 'omb-count' }, String(scenes.length)),
        h('span', { className: 'omb-spacer' }),
        h(Btn, {
          label: t('addScene'),
          variant: 'solid',
          disabled: services.length === 0,
          title: services.length === 0 ? t('needServiceFirst') : undefined,
          onClick: () => {
            setFormErrors({})
            setSceneDraft({ id: '', name: '', stopOnError: true, steps: [] })
          },
        }),
      )
      const sceneNodes = []
      if (sceneDraft) {
        sceneNodes.push(h(SceneForm, {
          key: 'form',
          t,
          draft: sceneDraft,
          services,
          busy: isBusy('scene-form'),
          error: formErrors.name || formErrors.steps,
          onChange: setSceneDraft,
          onCancel: () => setSceneDraft(null),
          onSave: saveSceneDraft,
          onError: setActionError,
        }))
      }
      if (!scenes.length && !sceneDraft && data) {
        sceneNodes.push(h('div', { className: 'omb-empty', key: 'empty' },
          h('p', null, services.length === 0 ? t('needServiceFirst') : t('emptyScenes')),
        ))
      }
      for (const scene of scenes) {
        sceneNodes.push(h(SceneCard, {
          key: scene.id,
          t,
          scene,
          services,
          run: sceneRun,
          busy: isBusy(`scene:${scene.id}`),
          onRun: runScene,
          onStop: stopScene,
          onEdit: openSceneEditor,
          onDelete: askDeleteScene,
        }))
      }

      return h('div', null,
        h(Crumb, { t, onBack: props.onBack, current: t('launcherTitle') }),
        h('header', { className: 'omb-head' },
          h('div', { className: 'omb-head-main' },
            h('h1', { className: 'omb-title' }, t('launcherTitle')),
            h('p', { className: 'omb-subtitle' }, t('launcherSubtitle')),
          ),
          h('div', { className: 'omb-head-actions' },
            busyRef.current.size > 0 ? h('span', { className: 'omb-note' }, t('working')) : null,
            h(Btn, { label: t('refresh'), onClick: refresh }),
          ),
        ),
        pollError || actionError || notice || confirming
          ? h('div', { className: 'omb-bars' },
            pollError
              ? h('div', { className: 'omb-bar omb-bar--error', role: 'alert' },
                h('span', { className: 'omb-bar-text' }, pollError),
              )
              : null,
            actionError
              ? h('div', { className: 'omb-bar omb-bar--error', role: 'alert' },
                h('span', { className: 'omb-bar-text' }, actionError),
                h(Btn, { size: 'sm', label: t('dismiss'), onClick: () => setActionError('') }),
              )
              : null,
            notice
              ? h('div', { className: 'omb-bar omb-bar--notice', role: 'status', 'aria-live': 'polite' },
                h('span', { className: 'omb-bar-text' }, notice),
              )
              : null,
            confirming
              ? h('div', {
                className: 'omb-bar omb-bar--ask',
                role: 'group',
                'aria-label': fill(
                  confirming.kind === 'service' ? t('confirmDeleteService') : t('confirmDeleteScene'),
                  { name: confirming.name },
                ),
              },
              h('span', { className: 'omb-bar-text' }, fill(
                confirming.kind === 'service' ? t('confirmDeleteService') : t('confirmDeleteScene'),
                { name: confirming.name },
              )),
              h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', onClick: confirmDelete }),
              h(Btn, { size: 'sm', label: t('cancel'), onClick: () => setConfirming(null) }),
              )
              : null,
          )
          : null,
        data
          ? h('div', { className: 'omb-grid' },
            h('section', { className: 'omb-section' },
              serviceHead,
              h('div', { className: 'omb-list' }, serviceNodes),
            ),
            h('section', { className: 'omb-section' },
              sceneHead,
              h('div', { className: 'omb-list' }, sceneNodes),
            ),
          )
          : h('p', { className: 'omb-muted' }, t('loading')),
        data
          ? h('footer', { className: 'omb-foot' },
            h('span', null, t('hint')),
            data.stateFile
              ? h('span', null,
                `${t('stateFile')}：`,
                h('code', { className: 'omb-mono', title: data.stateFile }, data.stateFile),
              )
              : null,
          )
          : null,
      )
    }

    /* ————————————————— 发票合并 ————————————————— */

    /**
     * 分段选择器。
     * @param {{ t: Function, label: string, value: string, options: Array<{ value: string, label: string }>, onChange: Function }} props 属性。
     * @returns {object} React 元素。
     */
    function Segmented(props) {
      return h('div', { className: 'omb-opt' },
        h('span', { className: 'omb-label' }, props.label),
        h('div', { className: 'omb-seg', role: 'group', 'aria-label': props.label },
          props.options.map(option => h('button', {
            key: option.value,
            type: 'button',
            className: `omb-seg-btn${props.value === option.value ? ' omb-seg-btn--on' : ''}`,
            'aria-pressed': props.value === option.value,
            onClick: () => props.onChange(option.value),
          }, option.label)),
        ),
      )
    }

    /**
     * 发票合并。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function InvoicesView(props) {
      const t = props.t
      const [files, setFiles] = useState([])
      const [layout, setLayout] = useState('auto')
      const [size, setSize] = useState('a4-portrait')
      const [marginMm, setMarginMm] = useState('8')
      const [cutLine, setCutLine] = useState(true)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [result, setResult] = useState(null)
      const [dragOver, setDragOver] = useState(false)
      const [preview, setPreview] = useState(null)
      const [previewBusy, setPreviewBusy] = useState(false)
      const [previewError, setPreviewError] = useState('')
      const [rasterizer, setRasterizer] = useState(true)
      const [printing, setPrinting] = useState(false)
      const inputRef = useRef(null)
      const idRef = useRef(0)
      const seqRef = useRef(0)
      const base64Ref = useRef(new Map())
      const imageFailedRef = useRef(false)
      const [folder, setFolder] = useState(null)
      const [saved, setSaved] = useState(null)
      const config = props.config
      const openDir = config && config.settings ? config.settings.openDir : ''

      const landscape = size === 'a4-landscape'

      useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(''), NOTICE_MS)
        return () => clearTimeout(timer)
      }, [notice])

      const appendFiles = list => {
        const incoming = Array.from(list || [])
        const pdfs = incoming.filter(file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf')
        const skipped = incoming.filter(file => !pdfs.includes(file))
        if (skipped.length > 0) setError(fill(t('onlyPdf'), { names: skipped.map(file => file.name).join(', ') }))
        else setError('')
        if (pdfs.length === 0) return
        setResult(null)
        setFiles(previous => previous.concat(pdfs.map(file => {
          idRef.current += 1
          return { id: `f${idRef.current}`, file, name: file.name, size: file.size }
        })))
      }

      /**
       * 读设置里的默认文件夹，列出里面的 PDF 供勾选。
       * @returns {Promise<void>} 读完 resolve。
       */
      const openFolder = async () => {
        setFolder({ busy: true, dir: '', files: [], selected: {}, error: '' })
        try {
          const payload = await call('/invoices/folder', {}, 30000)
          setFolder({ busy: false, dir: payload.dir, files: payload.files, selected: {}, error: '' })
        } catch (cause) {
          setFolder({ busy: false, dir: '', files: [], selected: {}, error: reasonOf(cause) })
        }
      }

      const toggleFolderFile = target => {
        setFolder(previous => {
          if (!previous) return previous
          const selected = Object.assign({}, previous.selected)
          if (selected[target] ) delete selected[target]
          else selected[target] = true
          return Object.assign({}, previous, { selected })
        })
      }

      const selectAllFolder = () => {
        setFolder(previous => {
          if (!previous) return previous
          const selected = {}
          for (const entry of previous.files) selected[entry.path] = true
          return Object.assign({}, previous, { selected })
        })
      }

      const addFromFolder = () => {
        if (!folder) return
        const picked = folder.files.filter(entry => folder.selected[entry.path])
        if (picked.length === 0) return
        setResult(null)
        setSaved(null)
        setFiles(previous => previous.concat(picked.map(entry => {
          idRef.current += 1
          return { id: `f${idRef.current}`, name: entry.name, size: entry.size, path: entry.path }
        })))
        setFolder(null)
      }

      const moveFile = (index, delta) => {
        const target = index + delta
        if (target < 0 || target >= files.length) return
        const next = files.slice()
        const swapped = next[target]
        next[target] = next[index]
        next[index] = swapped
        setFiles(next)
        setResult(null)
      }

      const removeFile = index => {
        setFiles(previous => previous.filter((item, at) => at !== index))
        setResult(null)
      }

      /**
       * 拼出合并请求体：文件只读一次，之后复用缓存的 base64。
       * @param {number} dpi 预览用的渲染分辨率（合并本身不使用）。
       * @returns {Promise<object>} 请求体。
       */
      const payloadFor = async dpi => {
        const payloadFiles = await Promise.all(files.map(async item => {
          if (item.path) return { name: item.name, path: item.path }
          let data = base64Ref.current.get(item.id)
          if (!data) {
            data = await fileToBase64(item.file)
            base64Ref.current.set(item.id, data)
          }
          return { name: item.name, data }
        }))
        return {
          files: payloadFiles,
          layout,
          size,
          marginMm: Number(marginMm) || 0,
          cutLine,
          dpi,
        }
      }

      const settingsKey = `${files.map(item => item.id).join(',')}|${layout}|${size}|${marginMm}|${cutLine}`

      useEffect(() => {
        if (files.length === 0) {
          seqRef.current += 1
          setPreview(null)
          setPreviewError('')
          setPreviewBusy(false)
          return undefined
        }
        const seq = seqRef.current + 1
        seqRef.current = seq
        setPreviewBusy(true)
        const timer = setTimeout(async () => {
          try {
            const body = await payloadFor(110)
            if (seq !== seqRef.current) return
            const json = await call('/preview', { method: 'POST', body: JSON.stringify(body) }, MERGE_TIMEOUT_MS)
            if (seq !== seqRef.current) return
            imageFailedRef.current = false
            setPreview({ token: json.token, pageCount: json.pageCount })
            setRasterizer(json.rasterizer !== false)
            setPreviewError('')
          } catch (cause) {
            if (seq !== seqRef.current) return
            setPreview(null)
            setPreviewError(reasonOf(cause))
          } finally {
            if (seq === seqRef.current) setPreviewBusy(false)
          }
        }, 550)
        return () => clearTimeout(timer)
      }, [settingsKey])

      const previewUrl = (token, page, dpi) => apiUrl(
        `/preview?token=${encodeURIComponent(token)}&page=${page}&dpi=${dpi}`,
      )

      const generate = async () => {
        if (files.length === 0) {
          setError(t('needFiles'))
          return
        }
        setBusy(true)
        setError('')
        setResult(null)
        try {
          const body = await payloadFor(110)
          const response = await fetch(apiUrl('/invoices'), {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(MERGE_TIMEOUT_MS) : undefined,
          })
          if (!response.ok) {
            let message = `生成失败（${response.status}）`
            try {
              const payload = await response.json()
              if (payload && payload.error) message = payload.error
            } catch {
              // 保留默认文案。
            }
            throw new Error(message)
          }
          const stats = JSON.parse(response.headers.get('x-omb-stats') || '{}')
          const blob = await response.blob()
          downloadBlob(blob, filenameFrom(response.headers.get('content-disposition')))
          setResult(stats)
          setNotice(t('saved'))
        } catch (cause) {
          setError(reasonOf(cause))
        } finally {
          setBusy(false)
        }
      }

      const saveToFolder = async () => {
        if (files.length === 0) {
          setError(t('needFiles'))
          return
        }
        setBusy(true)
        setError('')
        setSaved(null)
        try {
          const body = await payloadFor(110)
          const payload = await call('/invoices/save', { method: 'POST', body: JSON.stringify(body) }, MERGE_TIMEOUT_MS)
          setSaved({ path: payload.path, stats: payload.stats })
          setNotice(t('saved'))
        } catch (cause) {
          setError(reasonOf(cause))
        } finally {
          setBusy(false)
        }
      }

      const print = async () => {
        if (!preview) return
        setPrinting(true)
        setError('')
        try {
          const urls = []
          for (let page = 1; page <= preview.pageCount; page += 1) urls.push(previewUrl(preview.token, page, 190))
          // 限 3 并发：宿主的渲染队列只有 2 个并发槽 + 8 个等待位，一次全推会被拒。
          const queue = urls.map((url, index) => ({ url, index }))
          const load = entry => new Promise((resolve, reject) => {
            const image = new window.Image()
            image.onload = () => resolve()
            image.onerror = () => reject(new Error(`第 ${entry.index + 1} 页渲染失败`))
            image.src = entry.url
          })
          const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
            while (queue.length > 0) {
              const entry = queue.shift()
              await load(entry)
            }
          })
          await Promise.all(workers)
          await printImages(urls, landscape)
        } catch (cause) {
          setError(reasonOf(cause))
        } finally {
          setPrinting(false)
        }
      }

      const canPrint = Boolean(preview) && rasterizer && preview.pageCount > 0 && !printing && !previewBusy

      return h('div', null,
        h(Crumb, { t, onBack: props.onBack, current: t('invoicesTitle') }),
        h('header', { className: 'omb-head' },
          h('div', { className: 'omb-head-main' },
            h('h1', { className: 'omb-title' }, t('invoicesTitle')),
            h('p', { className: 'omb-subtitle' }, t('invoicesSubtitle')),
          ),
          h('div', { className: 'omb-head-actions' },
            files.length > 0 ? h('span', { className: 'omb-note' }, fill(t('fileCount'), { count: files.length })) : null,
          ),
        ),
        error || notice
          ? h('div', { className: 'omb-bars' },
            error
              ? h('div', { className: 'omb-bar omb-bar--error', role: 'alert' },
                h('span', { className: 'omb-bar-text' }, error),
                h(Btn, { size: 'sm', label: t('dismiss'), onClick: () => setError('') }),
              )
              : null,
            notice
              ? h('div', { className: 'omb-bar omb-bar--notice', role: 'status', 'aria-live': 'polite' },
                h('span', { className: 'omb-bar-text' }, notice),
              )
              : null,
          )
          : null,
        h('div', { className: 'omb-narrow omb-stack' },
          h('div', {
            className: `omb-drop${dragOver ? ' omb-drop--over' : ''}`,
            onDragOver: event => {
              event.preventDefault()
              setDragOver(true)
            },
            onDragLeave: () => setDragOver(false),
            onDrop: event => {
              event.preventDefault()
              setDragOver(false)
              appendFiles(event.dataTransfer && event.dataTransfer.files)
            },
          },
          h('span', null, t('dropTitle')),
          h('div', { className: 'omb-drop-row' },
            h(Btn, {
              label: t('chooseFiles'),
              variant: 'solid',
              onClick: () => inputRef.current && inputRef.current.click(),
            }),
            openDir
              ? h(Btn, {
                label: t('folderAdd'),
                title: openDir,
                onClick: openFolder,
              })
              : null,
            files.length > 0 ? h(Btn, {
              label: t('clearFiles'),
              onClick: () => {
                setFiles([])
                setResult(null)
                setSaved(null)
              },
            }) : null,
          ),
          h('input', {
            ref: inputRef,
            type: 'file',
            accept: 'application/pdf,.pdf',
            multiple: true,
            style: { display: 'none' },
            onChange: event => {
              appendFiles(event.target.files)
              event.target.value = ''
            },
          }),
          ),
          files.length === 0
            ? h('p', { className: 'omb-note' }, t('invoicesEmpty'))
            : h('div', { className: 'omb-files' },
              files.map((item, index) => h('div', { className: 'omb-file', key: item.id },
                h('span', { className: 'omb-file-index' }, String(index + 1)),
                h('span', { className: 'omb-file-name', title: item.name }, item.name),
                item.path ? h('span', { className: 'omb-count' }, t('pathFile')) : null,
                h('span', { className: 'omb-file-size' }, humanSize(item.size)),
                h('span', { className: 'omb-file-actions' },
                  h(Btn, { size: 'sm', label: '↑', disabled: index === 0, title: t('moveUp'), onClick: () => moveFile(index, -1) }),
                  h(Btn, { size: 'sm', label: '↓', disabled: index === files.length - 1, title: t('moveDown'), onClick: () => moveFile(index, 1) }),
                  h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', title: t('removeFile'), onClick: () => removeFile(index) }),
                ),
              )),
            ),
          folder
            ? h('div', { className: 'omb-picker' },
              h('div', { className: 'omb-picker-head' },
                h('span', { className: 'omb-h2' }, t('folderAdd')),
                folder.dir ? h('code', { className: 'omb-mono', title: folder.dir }, folder.dir) : null,
                h('span', { className: 'omb-spacer' }),
                folder.busy ? h('span', { className: 'omb-note' }, t('folderScanning')) : null,
                folder.files && folder.files.length > 0
                  ? h(Btn, { size: 'sm', label: t('selectAll'), onClick: selectAllFolder })
                  : null,
                h(Btn, {
                  size: 'sm',
                  label: fill(t('folderAddSelected'), { count: Object.keys(folder.selected || {}).length }),
                  variant: 'solid',
                  disabled: Object.keys(folder.selected || {}).length === 0,
                  onClick: addFromFolder,
                }),
                h(Btn, { size: 'sm', label: t('cancel'), onClick: () => setFolder(null) }),
              ),
              folder.error ? h('p', { className: 'omb-note' }, folder.error) : null,
              !folder.busy && folder.files && folder.files.length === 0 && !folder.error
                ? h('p', { className: 'omb-note' }, t('folderEmpty'))
                : null,
              folder.files && folder.files.length > 0
                ? h('div', { className: 'omb-picker-list' },
                  folder.files.map(entry => h('label', { className: 'omb-picker-row', key: entry.path },
                    h('input', {
                      type: 'checkbox',
                      checked: Boolean(folder.selected[entry.path]),
                      onChange: () => toggleFolderFile(entry.path),
                    }),
                    h('span', { className: 'omb-picker-name', title: entry.path }, entry.name),
                    h('span', { className: 'omb-picker-size' }, humanSize(entry.size)),
                  )),
                )
                : null,
            )
            : null,
          h('div', { className: 'omb-opts' },
            h(Segmented, {
              t,
              label: t('layoutLabel'),
              value: layout,
              onChange: setLayout,
              options: [
                { value: 'auto', label: t('layoutAuto') },
                { value: 'side', label: t('layoutSide') },
                { value: 'stack', label: t('layoutStack') },
              ],
            }),
            h(Segmented, {
              t,
              label: t('sizeLabel'),
              value: size,
              onChange: setSize,
              options: [
                { value: 'a4-portrait', label: t('sizePortrait') },
                { value: 'a4-landscape', label: t('sizeLandscape') },
              ],
            }),
            h('label', { className: 'omb-opt' },
              h('span', { className: 'omb-label' }, t('marginLabel')),
              h('div', { className: 'omb-row omb-row--center' },
                h('input', {
                  className: 'omb-input omb-input--narrow',
                  value: marginMm,
                  inputMode: 'numeric',
                  onChange: event => setMarginMm(event.target.value.replace(/[^0-9]/g, '').slice(0, 2)),
                }),
                h('span', { className: 'omb-label' }, t('marginUnit')),
              ),
            ),
            h('label', { className: 'omb-check' },
              h('input', {
                type: 'checkbox',
                checked: cutLine,
                onChange: event => setCutLine(event.target.checked),
              }),
              t('cutLine'),
            ),
          ),
          h('div', { className: 'omb-preview' },
            h('div', { className: 'omb-preview-head' },
              h('span', { className: 'omb-h2' }, t('previewTitle')),
              preview ? h('span', { className: 'omb-count' }, fill(t('previewPages'), { count: preview.pageCount })) : null,
              h('span', { className: 'omb-spacer' }),
              printing ? h('span', { className: 'omb-note' }, t('printing')) : null,
              previewBusy ? h('span', { className: 'omb-note' }, t('previewBusy')) : null,
              h(Btn, {
                label: t('print'),
                variant: 'solid',
                disabled: !canPrint,
                title: rasterizer ? undefined : t('previewUnavailable'),
                onClick: print,
              }),
              h(Btn, {
                label: t('saveToFolder'),
                disabled: busy || files.length === 0,
                title: config && config.settings ? config.settings.downloadDir : undefined,
                onClick: saveToFolder,
              }),
              h(Btn, {
                label: busy ? t('generating') : t('download'),
                disabled: busy || files.length === 0,
                onClick: generate,
              }),
            ),
            saved
              ? h('div', { className: 'omb-saved' },
                h('span', null, t('savedTo')),
                h('code', { className: 'omb-mono', title: saved.path }, saved.path),
                saved.stats
                  ? h('span', { className: 'omb-note' }, fill(t('resultSummary'), {
                    pages: saved.stats.pages,
                    sheets: saved.stats.sheets,
                    invoices: saved.stats.invoices,
                  }))
                  : null,
              )
              : null,
            result
              ? h('div', { className: 'omb-result' },
                h('span', null, fill(t('resultSummary'), {
                  pages: result.pages,
                  sheets: result.sheets,
                  invoices: result.invoices,
                })),
                result.autoPicked
                  ? h('span', { className: 'omb-note' }, fill(t('resultAutoLayout'), {
                    layout: result.layout === 'stack' ? t('layoutStack') : t('layoutSide'),
                  }))
                  : null,
              )
              : null,
            previewError
              ? h('p', { className: 'omb-note' }, fill(t('previewFailed'), { reason: previewError }))
              : null,
            !rasterizer
              ? h('p', { className: 'omb-note' }, t('previewUnavailable'))
              : null,
            files.length === 0
              ? h('p', { className: 'omb-note' }, t('previewEmpty'))
              : previewBusy && !preview
                ? h('div', { className: 'omb-pages' },
                  h('div', { className: `omb-shot omb-skel${landscape ? ' omb-shot--land' : ''}` }),
                )
                : preview && rasterizer
                  ? h('div', { className: 'omb-pages' },
                    Array.from({ length: preview.pageCount }, (unused, index) => h('div', { className: 'omb-page-shot', key: index },
                      h('img', {
                        className: `omb-shot${landscape ? ' omb-shot--land' : ''}`,
                        src: previewUrl(preview.token, index + 1, 110),
                        alt: fill(t('pageLabel'), { page: index + 1 }),
                        loading: 'lazy',
                        onError: () => {
                          if (imageFailedRef.current) return
                          imageFailedRef.current = true
                          setPreviewError(t('previewImageFailed'))
                        },
                      }),
                      h('span', { className: 'omb-shot-label' }, fill(t('pageLabel'), { page: index + 1 })),
                    )),
                  )
                  : null,
            h('p', { className: 'omb-note' }, t('printHint')),
          ),
          h('footer', { className: 'omb-foot' }, h('span', null, t('invoicesFooter'))),
        ),
      )
    }
    /* ————————————————— 书签夹 ————————————————— */

    /**
     * 浏览器 id 的显示名。
     * @param {Function} t 翻译。
     * @param {string} id 浏览器 id。
     * @returns {string} 文案。
     */
    function browserLabel(t, id) {
      const key = `browser${String(id || 'system').charAt(0).toUpperCase()}${String(id || 'system').slice(1)}`
      return t(key)
    }

    /**
     * 书签表单。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function BookmarkForm(props) {
      const { t, draft, browsers, errors = {}, busy } = props
      const set = (key, value) => {
        props.onClearError(key)
        props.onChange(Object.assign({}, draft, { [key]: value }))
      }
      return h('div', { className: 'omb-form' },
        h('div', { className: 'omb-bm-form' },
          h(Field, { label: t('bookmarkName'), error: errors.name },
            h('input', {
              className: 'omb-input',
              value: draft.name || '',
              placeholder: t('addBookmark'),
              onChange: event => set('name', event.target.value),
            }),
          ),
          h(Field, { label: t('bookmarkBrowser') },
            h('select', {
              className: 'omb-input',
              value: draft.browser || 'system',
              onChange: event => set('browser', event.target.value),
            },
            browsers.map(browser => h('option', {
              key: browser.id,
              value: browser.id,
              disabled: browser.available === false && browser.id !== 'custom',
            }, `${browserLabel(t, browser.id)}${browser.available === false && browser.id !== 'custom' ? t('browserNotInstalled') : ''}`)),
            ),
          ),
          h('div', { className: 'omb-field omb-field--full' },
            h(Field, { label: t('bookmarkUrl'), hint: t('bookmarkUrlHint'), error: errors.url },
              h('input', {
                className: 'omb-input',
                value: draft.url || '',
                spellCheck: false,
                placeholder: 'https://oa.example.com',
                onChange: event => set('url', event.target.value),
              }),
            ),
          ),
          h(Field, { label: t('bookmarkUsername') },
            h('input', {
              className: 'omb-input',
              value: draft.username || '',
              spellCheck: false,
              onChange: event => set('username', event.target.value),
            }),
          ),
          h(Field, { label: t('bookmarkPassword'), hint: draft.id && draft.hasPassword ? t('bookmarkPasswordKeep') : undefined },
            h('input', {
              className: 'omb-input',
              type: 'password',
              autoComplete: 'new-password',
              value: draft.password || '',
              placeholder: draft.id && draft.hasPassword ? '••••••' : '',
              onChange: event => set('password', event.target.value),
            }),
          ),
          draft.browser === 'custom'
            ? h('div', { className: 'omb-field omb-field--full' },
              h(Field, { label: t('bookmarkCustomPath'), error: errors.customPath },
                h('input', {
                  className: 'omb-input',
                  value: draft.customPath || '',
                  spellCheck: false,
                  placeholder: 'C:\\Program Files\\Custom\\browser.exe',
                  onChange: event => set('customPath', event.target.value),
                }),
              ),
            )
            : null,
          draft.id && draft.hasPassword
            ? h('label', { className: 'omb-check' },
              h('input', {
                type: 'checkbox',
                checked: draft.clearPassword === true,
                onChange: event => set('clearPassword', event.target.checked),
              }),
              t('clearPassword'),
            )
            : null,
        ),
        h('div', { className: 'omb-form-actions' },
          h(Btn, { label: t('cancel'), onClick: props.onCancel }),
          h(Btn, { label: t('save'), variant: 'solid', disabled: busy, onClick: props.onSave }),
        ),
      )
    }

    /**
     * 一条书签。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function BookmarkRow(props) {
      const { t, item, busy } = props
      return h('article', { className: 'omb-card' },
        h('div', { className: 'omb-card-title' },
          h('span', { className: 'omb-name', title: item.name }, item.name),
          h('span', { className: 'omb-count' }, browserLabel(t, item.browser)),
          h('div', { className: 'omb-card-actions' },
            h(Btn, { size: 'sm', label: t('open'), variant: 'solid', disabled: busy, onClick: () => props.onOpen(item) }),
            item.hasPassword
              ? h(Btn, { size: 'sm', label: t('copyPassword'), disabled: busy, onClick: () => props.onCopy(item) })
              : null,
            h(Btn, { size: 'sm', label: t('edit'), disabled: busy, onClick: () => props.onEdit(item) }),
            h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', disabled: busy, onClick: () => props.onDelete(item) }),
          ),
        ),
        h('div', { className: 'omb-meta' },
          h('code', { className: 'omb-mono', title: item.url }, item.url),
          item.username ? h('span', { className: 'omb-bm-user', title: item.username }, item.username) : null,
          h('span', { className: 'omb-note' }, item.hasPassword ? t('passwordSavedShort') : t('bookmarkPasswordEmpty')),
        ),
      )
    }

    /**
     * 书签夹。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function BookmarksView(props) {
      const t = props.t
      const [state, setState] = useState(null)
      const [draft, setDraft] = useState(null)
      const [formErrors, setFormErrors] = useState({})
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [confirming, setConfirming] = useState(null)

      const reload = useCallback(async () => {
        try {
          const payload = await call('/bookmarks')
          setState(payload)
          setError('')
          return payload
        } catch (cause) {
          setError(reasonOf(cause))
          return null
        }
      }, [])

      useEffect(() => {
        reload()
      }, [reload])

      useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(''), NOTICE_MS)
        return () => clearTimeout(timer)
      }, [notice])

      const act = async body => {
        setBusy(true)
        try {
          const payload = await call('/bookmarks', { method: 'POST', body: JSON.stringify(body) }, 30000)
          if (payload.state) setState(payload.state)
          setError('')
          return payload
        } catch (cause) {
          setError(reasonOf(cause))
          return null
        } finally {
          setBusy(false)
        }
      }

      const items = (state && state.items) || []
      const browsers = (state && state.browsers) || [{ id: 'system', available: true }]
      const credentials = state ? state.credentials !== false : true

      const startAdd = () => {
        setFormErrors({})
        setDraft({ id: '', name: '', url: '', username: '', password: '', browser: 'system', customPath: '', clearPassword: false })
      }

      const startEdit = item => {
        setFormErrors({})
        setDraft({
          id: item.id,
          name: item.name,
          url: item.url,
          username: item.username,
          password: '',
          browser: item.browser,
          customPath: item.customPath,
          clearPassword: false,
          hasPassword: item.hasPassword,
        })
      }

      const save = async () => {
        if (!draft) return
        const errors = {}
        if (!String(draft.name || '').trim()) errors.name = t('needName')
        if (!/^https?:\/\//i.test(String(draft.url || '').trim())) errors.url = t('bookmarkUrlHint')
        if (draft.browser === 'custom' && !String(draft.customPath || '').trim()) errors.customPath = t('bookmarkCustomPath')
        setFormErrors(errors)
        if (Object.keys(errors).length > 0) return
        const payload = await act({
          action: 'save',
          id: draft.id || '',
          name: draft.name,
          url: draft.url,
          username: draft.username,
          password: draft.password,
          browser: draft.browser,
          customPath: draft.customPath,
          clearPassword: draft.clearPassword === true,
        })
        if (payload) {
          setDraft(null)
          setNotice(t('saved'))
        }
      }

      const open = async item => {
        const payload = await act({ action: 'open', id: item.id })
        if (payload && payload.plan) {
          setNotice(fill(t('openedWith'), { browser: browserLabel(t, payload.plan.label) }))
        }
      }

      const copyPassword = async item => {
        const payload = await act({ action: 'secret', id: item.id })
        if (!payload || typeof payload.password !== 'string') return
        try {
          await navigator.clipboard.writeText(payload.password)
          setNotice(t('credentialCopied'))
        } catch {
          setError(`${t('copyPassword')}：${payload.password}`)
        }
      }

      const remove = async () => {
        if (!confirming) return
        const target = confirming
        setConfirming(null)
        const payload = await act({ action: 'delete', id: target.id })
        if (payload) setNotice(t('saved'))
      }

      const nodes = []
      if (draft) {
        nodes.push(h(BookmarkForm, {
          key: 'form',
          t,
          draft,
          browsers,
          errors: formErrors,
          busy,
          onChange: setDraft,
          onClearError: key => setFormErrors(previous => {
            if (!previous[key]) return previous
            const next = Object.assign({}, previous)
            delete next[key]
            return next
          }),
          onCancel: () => setDraft(null),
          onSave: save,
        }))
      }
      if (!items.length && !draft && state) {
        nodes.push(h('div', { className: 'omb-empty', key: 'empty' },
          h('p', null, t('emptyBookmarks')),
          h(Btn, { label: t('addBookmark'), variant: 'solid', onClick: startAdd }),
        ))
      }
      for (const item of items) {
        nodes.push(h(BookmarkRow, {
          key: item.id,
          t,
          item,
          busy,
          onOpen: open,
          onCopy: copyPassword,
          onEdit: startEdit,
          onDelete: setConfirming,
        }))
      }

      return h('div', null,
        h(Crumb, { t, onBack: props.onBack, current: t('bookmarksTitle') }),
        h('header', { className: 'omb-head' },
          h('div', { className: 'omb-head-main' },
            h('h1', { className: 'omb-title' }, t('bookmarksTitle')),
            h('p', { className: 'omb-subtitle' }, t('bookmarksSubtitle')),
          ),
          h('div', { className: 'omb-head-actions' },
            busy ? h('span', { className: 'omb-note' }, t('working')) : null,
            h(Btn, { label: t('addBookmark'), variant: 'solid', onClick: startAdd }),
          ),
        ),
        error || notice
          ? h('div', { className: 'omb-bars' },
            error
              ? h('div', { className: 'omb-bar omb-bar--error', role: 'alert' },
                h('span', { className: 'omb-bar-text' }, error),
                h(Btn, { size: 'sm', label: t('dismiss'), onClick: () => setError('') }),
              )
              : null,
            notice
              ? h('div', { className: 'omb-bar omb-bar--notice', role: 'status', 'aria-live': 'polite' },
                h('span', { className: 'omb-bar-text' }, notice),
              )
              : null,
          )
          : null,
        confirming
          ? h('div', { className: 'omb-bar omb-bar--ask', role: 'group' },
            h('span', { className: 'omb-bar-text' }, `${t('delete')}「${confirming.name}」？`),
            h(Btn, { size: 'sm', label: t('delete'), tone: 'danger', onClick: remove }),
            h(Btn, { size: 'sm', label: t('cancel'), onClick: () => setConfirming(null) }),
          )
          : null,
        h('div', { className: 'omb-narrow omb-stack' },
          state
            ? (nodes.length > 0 ? h('div', { className: 'omb-list' }, nodes) : h('p', { className: 'omb-muted' }, t('loading')))
            : h('p', { className: 'omb-muted' }, t('loading')),
        ),
        h('footer', { className: 'omb-foot' },
          state && state.file ? h('code', { className: 'omb-mono', title: state.file }, state.file) : null,
          credentials ? null : h('span', null, t('credentialsUnavailable')),
        ),
      )
    }

    /* ————————————————— 外壳 ————————————————— */

    /**
     * 面板外壳：主页 / 各功能视图之间的切换。
     * @param {object} props 属性。
     * @returns {object} React 元素。
     */
    function App(props) {
      const [view, setView] = useState('home')
      const [config, setConfig] = useState(null)

      const reload = useCallback(async () => {
        try {
          const payload = await call('/settings')
          setConfig(payload)
          return payload
        } catch {
          setConfig(null)
          return null
        }
      }, [])

      useEffect(() => {
        reload()
      }, [reload])

      const goHome = () => setView('home')
      const version = config ? config.version : ''

      return h('div', { className: 'omb-page' },
        h(Styles),
        h('div', { className: 'omb-shell' },
          view === 'launcher'
            ? h(LauncherView, { t: props.t, pickDirectory: props.pickDirectory, onBack: goHome })
            : view === 'invoices'
              ? h(InvoicesView, { t: props.t, onBack: goHome, config })
              : view === 'bookmarks'
                ? h(BookmarksView, { t: props.t, onBack: goHome })
                : view === 'settings'
                ? h(SettingsView, {
                  t: props.t,
                  onBack: goHome,
                  config,
                  pickDirectory: props.pickDirectory,
                  onSaved: setConfig,
                })
                : h(HomeView, { t: props.t, version, onOpen: setView }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'office-magic-box: locale zh')
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'office-magic-box: locale en')
        const t = ctx.locale.bind(NS)

        // 目录选择器是可选服务：点击时再取，晚注册也能用上。
        const pickDirectory = async () => {
          let workspace
          try {
            workspace = ctx.get('uiWorkspace')
          } catch {
            workspace = undefined
          }
          if (!workspace || typeof workspace.pickDirectory !== 'function') return { ok: false, reason: 'unavailable' }
          try {
            const path = await workspace.pickDirectory()
            return { ok: true, path: path || null }
          } catch (cause) {
            return { ok: false, reason: String((cause && cause.message) || cause) }
          }
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'office-magic-box',
          order: 40,
          label: () => t('panel'),
        }, PanelGlyph))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'office-magic-box',
          inject: () => ({ t, pickDirectory }),
        }, App))
      },
    }
  },
})

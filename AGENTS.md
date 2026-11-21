# AGENTS.md · 办公魔盒

给后续接手的人（或 agent）的项目记忆：这里记的是**为什么这样做**和**哪些坑已经踩过**，细节见 `docs/PROJECT.md`。

## 一句话

DSH 插件 `dsh-office-magic-box`：左侧栏一块面板，三个办公小工具（启动中控台 / 发票合并 / 书签夹）。作者 FBH · Forever Be Home（付本豪），MIT。

## 不可违反的约定

1. **浏览器半不引 Harness Client 包、不写 `document.body`**。客户端是纯 JS 的 `window.__ModuleLoader__.load({ id: '<包名>' , factory })`；`id` 必须等于 `package.json` 的 `name`（改名时三处要一起改：`package.json`、`cordis.patch.yml`、`client.js` 的 id）。
2. **Host 才有特权**：命令、文件、打印、浏览器都走 Host；客户端只调 `/api/office-magic-box/*`。
3. **进程归属**：中控台命令走 `ctx.subprocess`（受插件生命周期管理）；书签浏览器必须用 **detached** 子进程，否则插件重载会把用户的浏览器关掉。
4. **密码不进普通配置**：书签密码只能写 `ctx.credentials` 的 `api-key` 记录（键 `office-magic-box/bookmark/<id>`）；`bookmarks.json` 里绝不能出现明文，接口也不回显（只有 `action: 'secret'` 给剪贴板用）。
5. **预览是可选能力**：`officeKit.renderImages`（PDFium）不在就用降级文案，合并/保存/下载必须照常工作。
6. **市场索引随包走**：`market/index.json` 由 `dev/make-market.mjs` 从 `package.json` 生成，版本/作者/名称必须与包一致 —— `dev/validate-index.mjs` 会拦漂移。

## 常用命令

```bash
node dev/host-test.mjs        # 假 ctx/凭据/officeKit 的接口测试（92）
node dev/browsers-test.mjs    # 浏览器探测与启动计划（20）
node dev/invoices-test.mjs    # 2-up 几何与合并（34）
node dev/render-smoke.mjs     # 最小 React 桩渲染各视图（54）
node dev/validate-index.mjs   # 索引三基址解析 + 与包元数据漂移
node dev/release.mjs          # 重生成索引 → 校验 → 全测试 → npm pack
node dev/verify-published.mjs # 发布后：registry / jsDelivr / 图标
node dev/market/serve.mjs 8899  # 本机市场索引（自测「发现 → 安装」）
```

## 踩过的坑（别再踩）

- **npm 会改写 `package.json`**：`npm install`/`pack` 曾经把 `author` 改成机器配置里的名字。改完元数据要**解包核验 tarball 内**的字段，别只看磁盘。
- **市场取索引不接受重定向**：unpkg 的无版本与 `@latest` 都 302 → 报 `unexpected redirect`；必须用 `@<版本>` 钉住。
- **jsDelivr / raw.githubusercontent 在部分大陆网络直连 000**；unpkg 可达。索引地址要备多条。
- **`libreoffice-kit` 的 `maxPixels` 硬上限是 16,777,216**；预览按 A4@192dpi 只有 3.5MP，别传 40MP。
- **打印不能靠 PDF 插件**：用隐藏 iframe + `window.print()`，`@page size: A4`、每页一张图。
- **git 推 GitHub 常被 `Connection was reset`**：本机代理（mihomo）偶尔在 7897，通了就 `git config http.proxy` 临时用；代理退出后要 `--unset`。发布 npm 与推送互不依赖。
- **仓库命名别用 `@local/`**：发布要求公开名 + 去 `private`；改名后必须重装本地实例（remove → install）。

## 当前状态（1.4.0）

- 三个工具已实现并发布；设置页四个路径（中控台状态文件 / 书签清单 / 发票打开与保存文件夹）。
- 测试基线：92 + 20 + 34 + 54。
- 分发：npm `dsh-office-magic-box`；索引 `https://unpkg.com/dsh-office-magic-box@<版本>/market/index.json`；另有 git 源兜底 `market/index-git.json`。
- 待办：awesome-dsh-plugin 收录（仓库需公开满 24h，条目在 `dev/listing/`）；Hindsight 记忆未启用（缺 `HINDSIGHT_API_TOKEN`）。

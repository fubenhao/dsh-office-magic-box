# 办公魔盒 · 项目文档

一个 DSH 插件（bundle），左侧栏一块面板里放三个办公小工具：**启动中控台**、**发票合并**、**书签夹**。
作者：**FBH · Forever Be Home**（付本豪）——「此心安处是吾乡」；MIT；<https://github.com/fubenhao/dsh-office-magic-box>

## 1. 结构与分工

```
office-magic-box/
├─ index.js              Host 半：路由、数据、进程/打印/浏览器
├─ client.js             浏览器半：React 界面（无构建，纯 JS）
├─ lib/
│  ├─ invoices.js        发票 2-up 排版（pdf-lib）+ 槽位几何
│  └─ browsers.js        浏览器目录与启动计划（纯函数）
├─ market/
│  ├─ index.json         市场索引（source: npm），随包发布
│  └─ icon.svg           索引里的图标
├─ locale/{zh,en}.json   插件标题/描述/详情图
├─ docs/                 DETAIL.md、preview.svg、PUBLISHING.md、本文件、CHANGELOG.md
├─ icon.svg              插件图标
├─ dev/                  测试、发版脚本、本地索引（不随包发布）
└─ cordis.patch.yml      bundle patch（插入一行 office-magic-box）
```

**Host 半**（`index.js`，Node/Electron 主进程）负责一切需要特权的事；**浏览器半**（`client.js`）只做界面，通过已认证的 `/api/office-magic-box/*` 调用 Host。浏览器半没有构建步骤：`window.__ModuleLoader__.load({ id: '<包名>', factory(require) })`，React 来自宿主模块表。

## 2. 接口（都在已认证的 `/api` 通道上）

| 方法与路径 | 作用 |
|:--|:--|
| `GET /state` | 服务、场景、运行状态、日志尾部、插件版本 |
| `POST /act` | 服务/场景动作：`service.start|stop|restart|save|delete`、`scene.run|stop|save|delete` |
| `POST /invoices` | 合并 → 返回 PDF 字节，统计在 `x-omb-stats` 头 |
| `GET|POST /preview` | 合并并存 token（POST）；按页渲染 PNG（GET，`token&page&dpi`） |
| `GET /invoices/folder` | 列目录里的 PDF（「从文件夹添加」） |
| `POST /invoices/save` | 合并并写入「保存文件夹」，返回落盘路径 |
| `GET|POST /bookmarks` | 书签列表/动作：`save`、`delete`、`open`、`secret`（取密码复制） |
| `GET|POST /settings` | 读取/保存四个路径设置 |

渲染预览用宿主自带的 `officeKit.renderImages`（PDFium），因此不需要在插件里打包 PDF 渲染器；`officeKit` 不可用时预览降级、合并与保存不受影响。

## 3. 数据与凭据

| 内容 | 位置 | 说明 |
|:--|:--|:--|
| 设置 | `$DSH_HOME/office-magic-box/settings.json` | 四个路径：中控台状态文件、书签清单、发票打开/保存文件夹 |
| 服务与场景 | 设置里的状态文件（默认 `…/state.json`） | 换文件前会停掉当前运行的服务 |
| 书签清单 | 设置里的清单文件（默认 `…/bookmarks.json`） | **不含密码** |
| 书签密码 | 宿主凭据库（`ctx.credentials` 的 `api-key` 记录） | 键 `office-magic-box/bookmark/<id>`；界面不回显，只提供「复制密码」 |

## 4. 三个工具的要点

- **启动中控台**：命令经 `ctx.subprocess` 执行（受宿主管理：插件卸载即收尾）；场景按步骤顺序启动、可设间隔与失败即停。
- **发票合并**：`pdf-lib` 做 2-up（左右/上下、A4 纵横向、边距、裁切线、单数页留虚线位）；`auto` 按长宽比挑版式；打印用隐藏 iframe + 系统打印对话框，A4 逐页。
- **书签夹**：浏览器用**分离进程**拉起（`detached`），插件重载不会关掉浏览器；可选系统默认/Chrome/Edge/Firefox/Brave/自定义程序，目录由 `lib/browsers.js` 按平台探测。

## 5. 测试（`node dev/<file>`）

| 文件 | 覆盖 | 数量 |
|:--|:--|:--|
| `host-test.mjs` | 假 ctx + 假凭据库 + 假 officeKit：接口、启动/停止、场景、发票、预览、设置、书签 | **92** |
| `browsers-test.mjs` | 三平台浏览器探测与启动计划（纯函数） | 20 |
| `invoices-test.mjs` | 槽位几何、合并、自动版式、错误分支 | 34 |
| `render-smoke.mjs` | 最小 React 桩渲染各视图，断言结构/类名 | 54 |
| `validate-index.mjs` | 索引在三种基址下解析 + 与 `package.json` 漂移检查 | — |

## 6. 发版与分发

```bash
node dev/release.mjs                     # 重生成索引 → 校验 → 全测试 → npm pack
npm publish ./dsh-office-magic-box-<v>.tgz --access public --registry=https://registry.npmjs.org
node dev/verify-published.mjs            # registry / jsDelivr / 图标自检
```

- 市场索引随包发布：`https://unpkg.com/dsh-office-magic-box@<版本>/market/index.json`（**必须钉版本**，无版本与 `@latest` 会 302，市场不接受跳转）；`jsDelivr` 与 GitHub raw 是不跳转的稳定地址，但部分大陆网络不可达。
- 还有一份 `market/index-git.json`（`source.type = git`，钉 commit），不依赖 npm。
- 详见 `docs/PUBLISHING.md`。

## 7. 已知限制

- 预览需要宿主的 `officeKit`；没有时只能合并/下载。
- 书签密码需要宿主凭据服务；没有时保存会提示，其它字段照常。
- 「复制密码」把明文放进剪贴板，剪贴板历史可能留存。
- 打印的双面/边距由系统打印对话框与驱动决定，插件只保证每页恰好一张 A4。
- 浏览器探测只覆盖 Chrome/Edge/Firefox/Brave 的常见安装路径，其它浏览器请用自定义程序路径。

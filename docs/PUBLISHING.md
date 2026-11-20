# 发布到插件市场

结论：**可以，而且已经做完本地能验证的全部环节。** 剩下只有两步需要你的 npm 账号：登录 + 发布。

DSH 的市场只认两样东西：① 一个可安装的包（npm，或 git 仓库里的目录）；② 一个 format 1 的**索引 JSON**。索引是静态文件，放 GitHub Pages / jsDelivr / 自己的域名都行；用户在「插件 → 发现」里填上索引地址就能浏览、安装，不需要官方审核入库。

## 一、本次已完成（可复核）

| 项 | 状态 |
|:--|:--|
| 包名 | `@local/office-magic-box` → **`dsh-office-magic-box`**（公共 npm 上查过，名字空闲） |
| `private: true` | 已删除 |
| `author` / `license` | `{ "name": "FBH · Forever Be Home" }` / `MIT` |
| `homepage` / `repository` / `bugs` | 已填 `https://github.com/fubenhao/dsh-office-magic-box` |
| `engines.dsh` | `>=0.2.1-rc.2 \|\| >=0.2.2-rc.1` |
| 与包名绑定的三处 id | `package.json` name、`cordis.patch.yml` name、`client.js` 的 `__ModuleLoader__` id 已一致 |
| 打包 | `npm pack` → `dsh-office-magic-box-1.2.0.tgz`（12 文件 / 48.6 kB） |
| 产物实测 | 把 tarball `npm install` 到空项目后跑完整 Host 测试：**73/73 通过**（含 pdf-lib 由安装器解析） |
| 市场索引 | 两份同源：包内的 `market/index.json`（随包发布，可走 jsDelivr 公网托管）与 `dev/market/index.json`（本地自测用，`node dev/market/serve.mjs 8899`）。两者用 `dev/make-market.mjs` 一次生成，避免漂移 |
| 索引里的链接 | `homepage` 指向 **npm 页面**（公开可用）；仓库是私有的，故列表里不放仓库链接，避免外部用户点开 404 |
| 本地安装实例 | 已按新包名重装，`application: applied` |

## 二、发布命令（需要你的 npm 账号）

本机 npm 指向的是镜像 `https://registry.npmmirror.com/`，镜像只读，**发布必须显式指定公共源**：

```bash
cd "D:/工作/DSH/office-magic-box"
npm login --registry=https://registry.npmjs.org     # 当前状态：ENEEDAUTH，未登录
npm publish ./dsh-office-magic-box-1.2.0.tgz --access public --registry=https://registry.npmjs.org
# 或者先 npm pack 再发同一份产物；两种等价
```

发布后核对：

```bash
npm view dsh-office-magic-box version --registry=https://registry.npmjs.org
```

## 三、索引（format 1）

`dev/market/index.json` 就是可用的模板，字段说明：

```json
{
  "format": 1,
  "title": { "zh": "YG 的 DSH 插件", "en": "YG's DSH plugins" },
  "metadata": { "categories": { "office": { "title": { "zh": "办公", "en": "Office" } } }, "labels": {}, "sortKeys": {} },
  "plugins": [
    {
      "name": "dsh-office-magic-box",
      "title": { "zh": "办公魔盒", "en": "Office magic box" },
      "description": { "zh": "…", "en": "…" },
      "icon": "icon.svg",
      "author": "FBH · Forever Be Home",
      "homepage": "https://github.com/YG/dsh-office-magic-box",
      "repository": { "url": "https://github.com/YG/dsh-office-magic-box" },
      "metadata": { "category": "office", "keywords": ["invoice", "pdf", "launcher"], "labels": [], "sortKeys": {} },
      "versions": [
        { "version": "1.2.0", "publishTimestamp": 1763694000, "source": { "type": "npm" }, "engines": { "dsh": ">=0.2.1-rc.2 || >=0.2.2-rc.1" } }
      ]
    }
  ]
}
```

- `icon` 可为相对索引的路径（会解析成绝对 URL）、绝对 URL，或 32 KiB 内 `data:` URL；
- `metadata.category` / `labels` / `sortKeys` 的 id 必须在索引顶层声明，否则校验失败；
- 每次发版在 `versions` 追加一条（新版本号 + 新的 `publishTimestamp`，Unix 秒）。

## 四、仓库是私有的，意味着什么

- **npm 安装不受影响**：装包只依赖 registry，不读仓库。
- **git 源分发不可用**：市场里的 `source.type = git` 需要匿名可读的仓库；私有仓库只能走 npm 源（当前就是 npm 源）。
- **展示链接**：npm 页面上的 Repository 链接、市场卡片上的 homepage，对未登录者是 404。所以索引里 homepage 指向 npm 页面；`package.json` 里保留 `repository` 只作为你自己的元数据（npm 页面会显示它，点开需登录）。
- **索引托管不依赖仓库**：索引已打进包里，发布后直接用 jsDelivr 的 npm 通道，公网可读，无需 Pages、无需仓库公开：

  ```
  https://cdn.jsdelivr.net/npm/dsh-office-magic-box/market/index.json          # 指向最新版
  https://cdn.jsdelivr.net/npm/dsh-office-magic-box@1.2.0/market/index.json    # 钉住版本
  ```

  相对图标会解析成 `…/market/icon.svg`，已用 `parseMarketIndex` 按这三种基址实测通过。
- 以后若把仓库转公开：把 `dev/make-market.mjs` 里的 `NPM_PAGE` 换成仓库地址，重新生成两份索引即可。

## 五、把索引挂到 DSH

两种方式，任选：

1. **界面**：插件 → 发现 → 添加索引，填 `http://127.0.0.1:8899/index.json`（本地自测）或你托管后的 https 地址。
2. **配置**：在 profile 的 `cordis.patch.yml` 里给 `plugin-market` 的 `config.indexes` 追加一行 URL。

本地自测时先起服务：

```bash
node dev/market/serve.mjs 8899    # 改端口：node dev/market/serve.mjs 8901
```

## 六、本地已验证的边界（如实说明）

- 索引能被官方解析器接受、图标能取到、安装 spec 解析为 `dsh-office-magic-box@1.2.0`；
- 产物本身可安装、可运行（73 项断言）；
- **没有**做的一件事：在「发现」里点「安装」——那一步会去 npm 取 `dsh-office-magic-box@1.2.0`，在发布之前必然 404。发布后这一击才会通。

## 七、发版检查单

- [x] 公开包名、去掉 `private`、作者/许可证/engines
- [x] `npm pack` 产物不含 `dev/`、`node_modules/`、测试
- [x] 产物在空项目里装得上、跑得通
- [x] 索引格式校验通过、本地服务可访问
- [x] `homepage` / `repository` / `bugs` 指向真实仓库（私有，展示链接仅自己可见）
- [x] 索引随包发布（`market/`），可用 jsDelivr 公网托管
- [ ] `npm login` + `npm publish --registry=https://registry.npmjs.org`
- [ ] 发布后在「发现」里点安装，确认来源是 npm 而不是本地 link
- [ ] 插件详情页的图标、中英文描述、详情图显示正常
- [ ] 重新发版时同步更新索引 `versions`

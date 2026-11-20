import fs from "node:fs"

const NPM_PAGE = "https://www.npmjs.com/package/dsh-office-magic-box"
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const zh = JSON.parse(fs.readFileSync("locale/zh.json", "utf8")).meta
const en = JSON.parse(fs.readFileSync("locale/en.json", "utf8")).meta

const index = {
  format: 1,
  title: { zh: "FBH 的 DSH 插件", en: "FBH's DSH plugins" },
  description: { zh: "办公小工具：启动中控台、发票合并。", en: "Small office tools: launch console and invoice merge." },
  metadata: {
    categories: { office: { title: { zh: "办公", en: "Office" } } },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { zh: zh.title, en: en.title },
      description: { zh: zh.description, en: en.description },
      icon: "icon.svg",
      author: pkg.author.name,
      // 仓库是私有的：公开列表里指向 npm 页面，避免给外部用户一个 404 的仓库链接。
      homepage: NPM_PAGE,
      metadata: {
        category: "office",
        keywords: ["invoice", "pdf", "launcher", "office"],
        labels: [],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: "npm" },
          engines: { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

for (const dir of ["market", "dev/market"]) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(`${dir}/index.json`, `${JSON.stringify(index, null, 2)}\n`, "utf8")
  fs.copyFileSync("icon.svg", `${dir}/icon.svg`)
}
console.log("index written to market/ and dev/market/ | homepage:", NPM_PAGE)

import fs from "node:fs"
const mod = await import("file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js")
console.log("exports:", Object.keys(mod).join(", "))
const index = {
  format: 1,
  title: { en: "YG's DSH plugins", zh: "YG 的 DSH 插件" },
  description: { en: "Small office tools for DSH.", zh: "DSH 的办公小工具合集。" },
  metadata: {
    categories: { office: { title: { en: "Office", zh: "办公" } } },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: "dsh-office-magic-box",
      title: { en: "Office magic box", zh: "办公魔盒" },
      description: {
        en: "A launch console for local services plus a two-up invoice merger with live preview and duplex printing.",
        zh: "本机服务启动中控台 + 发票两页合一（实时预览、双面打印）。",
      },
      icon: "icon.svg",
      author: "YG",
      homepage: "https://github.com/YG/dsh-office-magic-box",
      repository: { url: "https://github.com/YG/dsh-office-magic-box" },
      metadata: { category: "office", keywords: ["invoice", "pdf", "launcher"], labels: [], sortKeys: {} },
      versions: [
        { version: "1.2.0", publishTimestamp: 1763694000, source: { type: "npm" }, engines: { dsh: ">=0.2.2-rc.1" } },
      ],
    },
  ],
}
try {
  const parsed = mod.parseMarketIndex(index, "https://example.com/dsh/index.json")
  console.log("VALID. plugins:", parsed.plugins.length, "versions:", parsed.plugins[0].versions.length)
  console.log("icon resolved:", parsed.plugins[0].icon)
  console.log("install spec:", JSON.stringify(mod.marketInstallTarget("dsh-office-magic-box", "1.2.0")))
} catch (error) {
  console.log("INVALID:", error.path, error.reason)
}

const mod = await import("file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js")
const url = "http://127.0.0.1:8899/index.json"
const body = await (await fetch(url)).json()
const parsed = mod.parseMarketIndex(body, url)
const plugin = parsed.plugins[0]
console.log("index title:", JSON.stringify(parsed.title))
console.log("plugin:", plugin.name, "| author:", plugin.author, "| versions:", plugin.versions.map(v => v.version).join(","))
console.log("icon resolved:", plugin.icon)
console.log("icon reachable:", (await fetch(plugin.icon)).status)
console.log("category:", plugin.metadata.category, "| keywords:", plugin.metadata.keywords.join(","))
console.log("engine:", JSON.stringify(plugin.versions[0].engines), "| source:", JSON.stringify(plugin.versions[0].source))
console.log("install spec:", JSON.stringify(mod.marketInstallTarget(plugin.name, plugin.versions[0])))

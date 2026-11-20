const mod = await import("file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js")
const fs = await import("node:fs")
const index = JSON.parse(fs.readFileSync("market/index.json", "utf8"))
for (const url of [
  "http://127.0.0.1:8899/index.json",
  "https://cdn.jsdelivr.net/npm/dsh-office-magic-box/market/index.json",
  "https://cdn.jsdelivr.net/npm/dsh-office-magic-box@1.2.0/market/index.json",
]) {
  const parsed = mod.parseMarketIndex(index, url)
  console.log("ok:", url)
  console.log("   icon ->", parsed.plugins[0].icon)
  console.log("   homepage ->", parsed.plugins[0].homepage, "| spec ->", mod.marketInstallTarget(parsed.plugins[0].name, parsed.plugins[0].versions[0]).spec)
}

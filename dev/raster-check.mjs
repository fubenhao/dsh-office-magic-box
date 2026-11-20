import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const mod = await import("file:///D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/libreoffice-kit/lib/index.js")
const converter = await mod.createConverter({})
const outputDir = path.join(os.tmpdir(), `omb-raster-${Date.now()}`)
const result = await converter.renderImages({
  inputPath: "D:/工作/DSH/office-magic-box/dev/sample-merged.pdf",
  outputDir,
  pages: [1, 2],
  dpi: 110,
  maxPages: 2,
  maxPixels: 16000000,
  maxDimension: 4000,
  maxBytes: 64 * 1024 * 1024,
})
for (const image of result.images) {
  const target = path.join("D:/工作/DSH/office-magic-box/dev", `preview-page-${image.page}.png`)
  fs.copyFileSync(image.path, target)
  console.log("saved", target, image.width + "x" + image.height, image.byteLength + " bytes")
}
await converter.dispose?.()

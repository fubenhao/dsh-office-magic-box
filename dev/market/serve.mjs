/**
 * 本地市场索引静态服务：只读 dev/market 目录，给 DSH「插件 → 发现」自测用。
 * 用法：node dev/market/serve.mjs [端口，默认 8899]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const types = {
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.tgz': 'application/octet-stream',
}
const port = Number(process.argv[2]) || 8899

http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  const name = url.pathname === '/' ? 'index.json' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const file = path.resolve(root, name)
  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('forbidden')
    return
  }
  fs.readFile(file, (error, bytes) => {
    if (error) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(`not found: ${name}`)
      return
    }
    response.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'content-length': bytes.length,
      'cache-control': 'no-store',
    })
    response.end(bytes)
  })
}).listen(port, '127.0.0.1', () => {
  console.log(`market index served at http://127.0.0.1:${port}/index.json`)
})

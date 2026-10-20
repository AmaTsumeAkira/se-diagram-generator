/**
 * file-saver 的 Node 端替身。
 *
 * src/utils/visioExport.ts 在模块顶层 `import { saveAs } from 'file-saver'`，
 * 并以 `saveAs(blob, name)` 作为唯一出口（浏览器里触发下载）。
 * 在 Node/MCP 里没有 DOM，下载没有意义，所以这里把 (blob, name) 捕获到一个
 * 全局数组，由 mcp/engine.ts 取走并转成 Buffer 落盘 / 返回。
 *
 * 通过 jiti 的 alias 注入（见 mcp/engine.ts），不修改 src/ 下的任何浏览器代码。
 */
const SLOT = '__DIAGRAM_MCP_SAVED__'

function savedList() {
  if (!globalThis[SLOT]) globalThis[SLOT] = []
  return globalThis[SLOT]
}

export function saveAs(blob, name) {
  savedList().push({ blob, name: String(name || 'diagram') })
}

export function takeSaved() {
  const list = savedList()
  const last = list.length ? list[list.length - 1] : null
  list.length = 0
  return last
}

export default { saveAs, takeSaved }

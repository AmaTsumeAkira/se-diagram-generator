/**
 * MCP stdio 服务入口。
 *
 * 启动方式：npm run mcp（= tsx mcp/server.ts）
 * 该进程同时做两件事：
 *   1. 在 stdio 上提供 MCP 协议（stdout 只走协议，日志一律 stderr）
 *   2. 在 127.0.0.1:4711 启动本地桥接，供浏览器里的编辑器连接
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startBridge } from './bridge.ts'
import { registerDiagramTools } from './tools.ts'

const VERSION = '1.0.0'

const log = (message: string): void => {
  console.error(`[diagram-mcp] ${message}`)
}

async function main(): Promise<void> {
  const bridge = await startBridge({ log })
  const token = process.env.DIAGRAM_MCP_TOKEN || undefined

  const server = new McpServer({ name: 'se-diagram-generator', version: VERSION })
  registerDiagramTools(server, { bridgeUrl: bridge.url, token, log })

  const shutdown = async (signal: string): Promise<void> => {
    log(`收到 ${signal}，正在退出`)
    try {
      await bridge.close()
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await server.connect(new StdioServerTransport())
  log(`MCP 已就绪（stdio）。桥接地址 ${bridge.url}${bridge.attached ? '（复用已有实例）' : ''}`)
  log('提示：在 GUI 里点击工具栏的 MCP 徽标连接后，diagram_send / diagram_get 才能实时生效。')
}

main().catch((e: unknown) => {
  log(`启动失败：${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
  process.exit(1)
})

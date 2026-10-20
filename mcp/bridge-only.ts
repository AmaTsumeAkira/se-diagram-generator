/**
 * 只启动桥接（不跑 MCP 协议），方便：
 *   - 编辑器单独连接，用 curl / 脚本直接调 HTTP 接口
 *   - 与已运行的 MCP 服务共用（端口占用时自动复用）
 *
 * 运行：npm run mcp:bridge
 */
import { startBridge } from './bridge.ts'

const log = (message: string): void => {
  console.error(`[diagram-bridge] ${message}`)
}

const bridge = await startBridge({ log })

if (bridge.attached) {
  log(`已有桥接实例在 ${bridge.url}，本进程无需再监听，退出`)
  process.exit(0)
}

log(`HTTP 接口：${bridge.url}`)
log('  GET  /health        健康检查')
log('  GET  /state?fresh=1 读取编辑器当前配置')
log('  PUT  /state         编辑器上报配置（页面自动调用）')
log('  POST /apply         推送一张图 / 全量配置')
log('  GET  /events        SSE（页面订阅）')

process.on('SIGINT', async () => {
  await bridge.close()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await bridge.close()
  process.exit(0)
})

// 保持进程存活
setInterval(() => {}, 1 << 30)

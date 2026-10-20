# 本地 MCP 服务（让外部 AI / 脚本收发图）

这个目录给编辑器加了一个**本地 MCP 服务 + HTTP 桥接**：

- 外部 MCP 客户端（Claude Desktop / Cursor / Claude Code / VS Code …）调用工具生成图 → **实时出现在打开着的编辑器里**（自动切标签页，可 Ctrl+Z 撤销）
- MCP 也能**读回编辑器当前的 9 张图**，改完再推回去
- 另外可直接导出 **SVG / Visio VSDX** 文件，全程不需要浏览器
- 同一进程还开了 `http://127.0.0.1:4711` 的 HTTP 接口，`curl` / 脚本可直接用

## 数据格式

MCP 收发用的 JSON 与编辑器「导出全部数据 / 导入」**完全一致**：

- 单张图：`{ "nodes": [ { "id": "...", "type": "...", "label": "...", ... } ], "edges": [ ... ] }`
- 全量：`{ "usecase": {...}, "structure": {...}, "er": {...}, ... }`
- 节点除 `id/type/label` 外的字段（ER 的 `fields`、类图的 `attributes/methods`、时序的 `participantType` 等）与导入格式相同
- ER 关系可以直接写 `entity ↔ entity` 边（`label` 写联系名、`data.sourceCard/targetCard` 写两端基数）：MCP 与页面都会按编辑器内部约定自动补成 `erDiamond + 两条边`，无需手写菱形
- 各图类型支持哪些节点/字段：调用 MCP 工具 `diagram_catalog`，或看 `mcp/catalog.ts`

```jsonc
// 例：时序图
{
  "nodes": [
    { "id": "p_user", "type": "participant", "label": "用户", "participantType": "actor" },
    { "id": "p_sys",  "type": "participant", "label": "系统", "participantType": "system" }
  ],
  "edges": [
    { "id": "m1", "source": "p_user", "target": "p_sys", "label": "登录请求", "data": { "messageType": "sync" } }
  ]
}
```

## 快速开始

```bash
npm install            # 首次
npm run mcp            # 启动 MCP(stdin/stdout) + 本地桥接(127.0.0.1:4711)
npm run dev            # 另开一个终端，启动编辑器
```

打开 `http://localhost:5173` 后，工具栏会出现 **MCP** 徽标：

- 灰点 = 未连接（先运行 `npm run mcp`，再点一下徽标）
- 绿点 = 已连接（可收发图）
- 页面会自动尝试连一次；手动断开的选择会记住（localStorage `diagram-mcp-enabled`）

> 编辑器自身不依赖 MCP：桥接没启动时一切照旧，只是徽标保持灰色。
>
> **线上静态站点（GitHub Pages / 腾讯云 Pages）默认隐藏 MCP 徽标**：线上页面无法连接本机桥接，
> 徽标只会占页眉空间。开发服务器（`npm run dev`）始终显示；如果想用生产构建在本机预览 MCP，
> 在地址后加 `?mcp=1`（例如 `http://localhost:4173/?mcp=1`）即可启用。

## 接进 MCP 客户端

服务入口是 `mcp/server.ts`，用仓库自带的 `tsx` 直接跑 TypeScript（无需先 build）。
**把下面的 `/ABSOLUTE/PATH/to/se-diagram-generator` 换成你的绝对路径。**

### Claude Code

```bash
claude mcp add se-diagram -- /ABSOLUTE/PATH/to/se-diagram-generator/node_modules/.bin/tsx /ABSOLUTE/PATH/to/se-diagram-generator/mcp/server.ts
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "se-diagram": {
      "command": "/ABSOLUTE/PATH/to/se-diagram-generator/node_modules/.bin/tsx",
      "args": ["/ABSOLUTE/PATH/to/se-diagram-generator/mcp/server.ts"]
    }
  }
}
```

### Cursor

项目根 `.cursor/mcp.json`（或 `~/.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "se-diagram": {
      "command": "/ABSOLUTE/PATH/to/se-diagram-generator/node_modules/.bin/tsx",
      "args": ["mcp/server.ts"],
      "cwd": "/ABSOLUTE/PATH/to/se-diagram-generator"
    }
  }
}
```

### VS Code（Copilot MCP）

`.vscode/mcp.json`：

```json
{
  "servers": {
    "se-diagram": {
      "type": "stdio",
      "command": "/ABSOLUTE/PATH/to/se-diagram-generator/node_modules/.bin/tsx",
      "args": ["/ABSOLUTE/PATH/to/se-diagram-generator/mcp/server.ts"]
    }
  }
}
```

> 同一个服务可以同时给多个客户端用：第一个进程占住 4711 端口，后续进程会自动复用（日志里会写「复用已有桥接实例」）。

## 工具

| 工具 | 作用 |
| --- | --- |
| `diagram_catalog` | 9 类图的节点/边字段、示例、ER 表示法说明。**建议先调它** |
| `diagram_render` | 平面 JSON → SVG / VSDX。返回文件路径 + 内嵌资源；可传 `savePath` |
| `diagram_export` | 平面 JSON → 落盘 `.svg` / `.vsdx`，返回绝对路径 |
| `diagram_send` | 平面 JSON → **实时推送到打开的编辑器**（只替换该类图，自动切标签页；页面不在线则排队补发） |
| `diagram_get` | 读回编辑器当前 9 张图（`type` 只取一张；`fresh=1` 先向页面要最新，默认开启） |
| `diagram_import` | 解析编辑器导出的 JSON（全量或单张），返回归一化配置；`path` 读取磁盘文件 |
| `diagram_status` | 桥接是否运行、页面是否连接、是否有排队推送 |

典型用法：

```text
1. diagram_catalog(type=["sequence"])           # 看字段
2. diagram_send(type="sequence", nodes=…, edges=…)
   → 编辑器自动切到时序图并显示
3. diagram_get(type="sequence")                 # 读回当前内容继续改
4. diagram_export(type="er", nodes=…, edges=…, format="vsdx", path="docs/er.vsdx")
```

## HTTP 接口（不用 MCP 也能调）

服务监听 `http://127.0.0.1:4711`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查（页面用来判断桥接是否在运行） |
| GET | `/state?fresh=1` | 读编辑器当前全部配置；`fresh=1` 先让页面立即上报（最多等 2s） |
| PUT | `/state` | 编辑器上报配置（页面自动调用） |
| POST | `/apply` | 推送一张图或全量配置 |
| GET | `/events` | SSE 长连接（页面订阅；`apply` / `state-request` 事件） |

```bash
# 推送一张图（只替换 flowchart 这一张，其他图不动）
curl -s http://127.0.0.1:4711/apply -H 'Content-Type: application/json' -d '{
  "apply": "merge",
  "type": "flowchart",
  "diagram": {
    "nodes": [
      { "id": "s", "type": "start", "label": "开始" },
      { "id": "p", "type": "process", "label": "处理" },
      { "id": "e", "type": "end", "label": "结束" }
    ],
    "edges": [
      { "id": "e1", "source": "s", "target": "p" },
      { "id": "e2", "source": "p", "target": "e" }
    ]
  }
}'

# 全量替换（9 张图）
curl -s http://127.0.0.1:4711/apply -H 'Content-Type: application/json' \
  -d "{\"apply\":\"replace\",\"configs\": $(cat diagram-configs.json)}"

# 读取当前配置
curl -s 'http://127.0.0.1:4711/state?fresh=1'
```

`/apply` 的 `apply` 字段：`merge`（默认，单张图模式）或 `replace`（全量配置模式）。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DIAGRAM_MCP_PORT` | `4711` | 桥接端口（MCP 进程与 `mcp:bridge` 都读它） |
| `DIAGRAM_MCP_TOKEN` | 空 | 设置后，除 `/health` 外的 HTTP 接口要求 `X-MCP-Token` 头；MCP 工具会自动带上 |
| `DIAGRAM_MCP_BRIDGE_URL`（客户端侧） | — | 页面用 localStorage 的 `diagram-mcp-bridge-url` 覆盖桥接地址，例如 `http://127.0.0.1:4800` |

## 实现要点

```
外部 AI / 脚本
   │ MCP stdio（JSON-RPC）
   ▼
mcp/server.ts  ──注册工具──▶ mcp/tools.ts
   │                          │
   │                          ├─ mcp/engine.ts —— jiti 直接加载 src/utils 下的纯 TS 渲染器
   │                          │     ├ 9 类图：svgExport.ts（SVG）
   │                          │     └ visioExport.ts（VSDX）＋ shims/file-saver.mjs
   │                          │
   │                          └─ mcp/bridge.ts —— HTTP + SSE（127.0.0.1）
   ▼                                              ▲
编辑器（React）◀── src/hooks/useMcpBridge.ts ──────┘
   绿点徽标、防抖 PUT /state、SSE 收到 apply → pushConfigs（可撤销）
```

- **不需要浏览器渲染**：`src/utils/svgExport.ts` / `drawioExport.ts` 是纯字符串渲染，`visioExport.ts` 用 JSZip 生成 VSDX；MCP 进程里用 `jiti` 直接执行 TS 源码（无构建产物）
- `visioExport.ts` 顶层 `import { saveAs } from 'file-saver'`（浏览器下载用），Node 里通过 jiti alias 换成 `mcp/shims/file-saver.mjs`，把 Blob 捕获出来写盘 —— **没有改动 src/ 下的任何代码**
- 推送前会先过一遍 `parseDiagram` + `normalizeUseCaseConfig / normalizeEntityConfig`，与编辑器「应用修改」走同一条路径，避免共享子节点膨胀
- ER 关系补全逻辑放在 `src/utils/erRelationNormalize.ts`，编辑器、MCP、HTTP 桥接共用一份：直连边 → `erDiamond` 三段式（否则排版引擎只认菱形、直连边会被忽略）
- 页面端只做两件事：收到 `apply` 就 `pushConfigs`（进撤销栈），配置变化时防抖 `PUT /state`

## 安全

- 桥接只绑定 `127.0.0.1`，不对外网开放
- CORS 只放行 `http://localhost:*` / `http://127.0.0.1:*` 来源
- 线上静态站点（https）无法连本地 http 桥接（浏览器 mixed-content 拦截），不会误触发
- 如需防止同机其他网页/进程调用，设置 `DIAGRAM_MCP_TOKEN`
- 注意：能调用桥接 = 能改编辑器里的图；不要在有敏感数据时关闭 token 并同时运行不可信脚本

## 测试

```bash
npm run typecheck:mcp   # mcp/ 目录类型检查（strict）
npm run mcp:selftest    # Node 端：9 类图 SVG + VSDX + ER 四种表示法
npm run mcp:smoke       # MCP 协议：initialize / tools/list / 关键工具调用
```

## 排障

| 现象 | 处理 |
| --- | --- |
| 徽标一直是灰点 | 确认 `npm run mcp` 在运行；`curl http://127.0.0.1:4711/health` 应返回 `ok` |
| `diagram_send` 说「已排队」 | 页面没连上（没打开/没点 MCP 徽标）；打开页面会自动补发排队消息 |
| `diagram_get` 返回 no-state | 页面从未连接过；先连接一次，或让页面保持打开 |
| 端口被占 | 大概率已有 MCP/桥接实例在跑（正常，会自动复用）；换端口用 `DIAGRAM_MCP_PORT`，同时设置页面 localStorage `diagram-mcp-bridge-url` |
| VSDX 打不开 | 确认是 `application/vnd.ms-visio.drawing` 的 zip 包（文件头 `PK`）；Visio / draw.io 均可打开 |

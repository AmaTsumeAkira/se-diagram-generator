import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { inflateRawSync } from 'node:zlib'
import { parseSql, deriveRelationships, isJunctionTable } from './src/utils/sqlParser'
import { erDrawio } from './src/utils/drawioExport'

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function buildERState(tablesInput: any[], relationshipsInput: any[], parseErrors: string[] = []) {
  const tables = tablesInput.map(table => typeof table === 'string' ? { name: table } : table)
  const relationships = relationshipsInput
  const nodes: any[] = tables.map(table => ({
    id: table.id || `ent_${table.name}`,
    type: 'erEntity',
    data: { label: table.label || table.name, row: table.row, col: table.col },
    position: { x: 0, y: 0 },
  }))
  const edges: any[] = []

  relationships.forEach((rel, i) => {
    const sourceId = rel.source?.startsWith?.('ent_') ? rel.source : `ent_${rel.sourceTable || rel.source}`
    const targetId = rel.target?.startsWith?.('ent_') ? rel.target : `ent_${rel.targetTable || rel.target}`
    const diamondId = `dia_${rel.id || `${sourceId}_${targetId}_${i}`}`
    nodes.push({
      id: diamondId,
      type: 'erDiamond',
      data: { label: rel.label || '关联' },
      position: { x: 0, y: 0 },
    })
    edges.push({
      id: `e_${sourceId}_${diamondId}`,
      source: sourceId,
      target: diamondId,
      data: { sourceCard: rel.sourceCardinality || rel.sourceCard || '1', targetCard: '' },
    })
    edges.push({
      id: `e_${diamondId}_${targetId}`,
      source: diamondId,
      target: targetId,
      data: { sourceCard: '', targetCard: rel.targetCardinality || rel.targetCard || 'N' },
    })
  })

  return { tables, parseErrors, relationships, nodes, edges }
}

function sqlToERState(sql: string) {
  const parsed = parseSql(sql)
  return buildERState(parsed.tables.filter(table => !isJunctionTable(table)), deriveRelationships(parsed.tables), parsed.errors)
}

function auditDrawio(xml: string) {
  const diagramContent = xml.match(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/)?.[1]?.trim()
  const auditXml = diagramContent && !diagramContent.startsWith('<')
    ? inflateRawSync(Buffer.from(diagramContent, 'base64')).toString('utf8')
    : xml
  const edgeCells = [...auditXml.matchAll(/<mxCell\b[^>]*edge="1"[^>]*>/g)].map(m => m[0])
  const unattachedEdges = edgeCells.filter(cell => !/\bsource="[^"]+"/.test(cell) || !/\btarget="[^"]+"/.test(cell)).length
  const absolutePointEdges = (auditXml.match(/as="sourcePoint"|as="targetPoint"/g) || []).length
  const vertexMatches = [...auditXml.matchAll(/<mxCell\b([^>]*)\bvertex="1"[^>]*>[\s\S]*?<mxGeometry\b([^>]*)\bas="geometry"\/>/g)]
  const boxes = vertexMatches.map(m => {
    const cellAttrs = m[1]
    const isText = /\bstyle="[^"]*\btext;/.test(cellAttrs)
    const isLabel = /\bconnectable="0"/.test(cellAttrs)
    if (isText || isLabel) return null
    const attrs = m[2]
    const read = (name: string) => Number(attrs.match(new RegExp(`${name}="([^"]+)"`))?.[1] || 0)
    return { x: read('x'), y: read('y'), w: read('width'), h: read('height') }
  }).filter((b): b is { x: number; y: number; w: number; h: number } => !!b && b.w > 0 && b.h > 0)
  let overlaps = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlaps++
    }
  }

  return {
    edgeCount: edgeCells.length,
    unattachedEdges,
    absolutePointEdges,
    vertexCount: boxes.length,
    overlaps,
    usable: edgeCells.length > 0 && unattachedEdges === 0 && absolutePointEdges === 0 && overlaps === 0,
  }
}

function erDrawioApiPlugin() {
  return {
    name: 'er-drawio-api',
    configureServer(server: any) {
      server.middlewares.use('/api/er/drawio', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }

        try {
          const body = await readBody(req)
          const contentType = req.headers['content-type'] || ''
          const payload = contentType.includes('application/json') ? JSON.parse(body || '{}') : null
          const result = payload?.tables && payload?.relationships
            ? buildERState(payload.tables, payload.relationships)
            : sqlToERState(payload?.sql || body)
          const xml = erDrawio(result.nodes as any, result.edges as any)
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            tables: result.tables.map((table: any) => ({
              name: table.name,
              foreignKeys: table.foreignKeys || [],
              primaryKeys: table.primaryKeys || [],
              uniqueKeys: table.uniqueKeys || [],
            })),
            parseErrors: result.parseErrors,
            relationships: result.relationships,
            nodes: result.nodes.length,
            edges: result.edges.length,
            audit: auditDrawio(xml),
            xml,
          }))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: err.message || String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [erDrawioApiPlugin(), react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/api/ai': {
        target: 'https://opencode.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '')
      }
    }
  }
})

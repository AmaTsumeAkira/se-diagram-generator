import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'
import { layoutTreeStructure } from './layout'
import { collectERRelations, routeRelations } from './erRouting'

type DNode = Node<DiagramNodeData>

// ====== Drawio XML helpers ======

function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function fontSize(data?: DiagramNodeData): number { return (data?.fontSize as number) || 14 }
function fontFamily(data?: DiagramNodeData): string { return (data?.fontFamily as string) || 'SimSun' }
function fontStyle(data?: DiagramNodeData): string { return `fontFamily=${esc(fontFamily(data))};fontSize=${fontSize(data)};` }
function textWidth(s: string, fs: number): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? fs : fs * 0.6
  return w
}

const RECT = 'whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;'
const ELLIPSE = 'ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;'
const TREE_EDGE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=8;html=1;strokeColor=#000000;startArrow=none;endArrow=none;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;'
const LINE = 'html=1;strokeColor=#000000;startArrow=none;endArrow=none;'
const ARROW = 'endArrow=block;html=1;strokeColor=#000000;'
const ARROW_DASHED = 'endArrow=block;html=1;strokeColor=#000000;dashed=1;'
const UML_ACTOR = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=none;strokeColor=#000000;'

function rect(id: string, x: number, y: number, w: number, h: number, label: string, st = RECT) {
  return `<mxCell id="${id}" value="${esc(label)}" style="${st}" vertex="1" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" as="geometry"/></mxCell>`
}

function edge(id: string, src: string, tgt: string, st = LINE) {
  return `<mxCell id="${id}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>`
}

function anchoredEdge(id: string, src: string, tgt: string, st: string, exitX: number, exitY: number, entryX: number, entryY: number) {
  const style = `${st}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;`
  return edge(id, src, tgt, style)
}

function wrap(name: string, cells: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="se-diagram-generator" modified="2026-01-01T00:00:00.000Z" agent="SE Diagram Generator" version="21.0.0">
  <diagram name="${esc(name)}" id="d1">
    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1400" pageHeight="1000" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`
}

// ====== Use Case ======

export function useCaseDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const groups = new Map<string, { actor: DNode; useCases: DNode[] }>()
  nodes.filter((n) => n.type === 'actor').forEach((a) => {
    const ucIds = new Set(edges.filter((e) => e.source === a.id).map((e) => e.target))
    groups.set(a.id, { actor: a, useCases: nodes.filter((n) => n.type === 'usecase' && ucIds.has(n.id)) })
  })

  const groupList = Array.from(groups.values())
  const cols = Math.max(1, Math.ceil(Math.sqrt(groupList.length)))
  const rows: { actor: DNode; useCases: DNode[] }[][] = []
  for (let i = 0; i < groupList.length; i += cols) rows.push(groupList.slice(i, i + cols))

  const actorOff = 40
  const ucOff = 280
  const cellW = 380
  const ucSpacing = 48
  const ucMinH = 30
  const rowGap = 50
  const actorW = 55
  const actorH = 102
  const actorArmY = 40 / actorH

  const rowHeights = rows.map((row) => {
    const maxUc = Math.max(...row.map((g) => g.useCases.length), 1)
    return (maxUc - 1) * ucSpacing + ucMinH + rowGap
  })

  let y = 110
  rows.forEach((row, ri) => {
    const rowH = rowHeights[ri]
    const blockH = rowH - rowGap

    row.forEach((g, ci) => {
      const bx = ci * cellW
      const totalH = (g.useCases.length - 1) * ucSpacing
      const ay = y + blockH / 2 - 70
      const sy = y + blockH / 2 - totalH / 2
      const ux = bx + ucOff

      const aid = nid()
      idMap.set(g.actor.id, aid)
      cells.push(rect(aid, bx + actorOff, ay, actorW, actorH, g.actor.data.label || '', UML_ACTOR + fontStyle(g.actor.data)))

      const maxW = g.useCases.reduce((m, uc) => {
        return Math.max(m, textWidth(String(uc.data.label || ''), fontSize(uc.data)))
      }, 0)
      const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

      g.useCases.forEach((uc, ui) => {
        const ry = (uc.data.ry as number) ?? 15
        const uid = nid()
        idMap.set(uc.id, uid)
        cells.push(rect(uid, ux - rx, sy + ui * ucSpacing - ry, rx * 2, ry * 2, uc.data.label || '', ELLIPSE + fontStyle(uc.data)))
        cells.push(anchoredEdge(nid(), aid, uid, ARROW, 1, actorArmY, 0, 0.5))
      })
    })

    y += rowH
  })

  return wrap('用例图', cells.join('\n'))
}

export function useCaseDrawioLegacy(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const groups = new Map<string, { actor: DNode; useCases: DNode[] }>()
  nodes.filter((n) => n.type === 'actor').forEach((a) => {
    const ucIds = new Set(edges.filter((e) => e.source === a.id).map((e) => e.target))
    groups.set(a.id, { actor: a, useCases: nodes.filter((n) => n.type === 'usecase' && ucIds.has(n.id)) })
  })

  const cols = Math.ceil(Math.sqrt(groups.size))
  const cw = 380; const sp = 48
  let gi = 0
  groups.forEach((g) => {
    const ci = gi % cols; const ri = Math.floor(gi / cols)
    const bx = ci * cw; const by = ri * 360
    const ay = by + 120
    const bh = (g.useCases.length - 1) * sp + 30
    const sy = by + 140 - bh / 2
    const ux = bx + 280
    const maxW = g.useCases.reduce((m, uc) => {
      let w = 0; for (const ch of (uc.data.label || '')) w += ch.charCodeAt(0) > 127 ? 14 : 8
      return Math.max(m, w)
    }, 0)
    const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

    // 火柴人用矩形 + 无填充模拟
    const aid = nid(); idMap.set(g.actor.id, aid)
    cells.push(rect(aid, bx + 15, ay, 55, 100, g.actor.data.label || '', RECT + 'fillColor=none;verticalAlign=bottom;verticalLabelPosition=bottom;'))

    g.useCases.forEach((uc, ui) => {
      const uid = nid(); idMap.set(uc.id, uid)
      cells.push(rect(uid, ux - rx, sy + ui * sp - 15, rx * 2, 30, uc.data.label || '', ELLIPSE))
      cells.push(edge(nid(), aid, uid, ARROW))
    })
    gi++
  })

  return wrap('用例图', cells.join('\n'))
}

// ====== Structure (drawio原生正交路由) ======

export function structureDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const { nodes: ln } = layoutTreeStructure(nodes, edges)
  const idMap = new Map<string, string>()
  const cells: string[] = []

  ln.forEach((n) => {
    const did = nid(); idMap.set(n.id, did)
    const x = n.position.x; const y = n.position.y
    const vert = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const ffStyle = fontStyle(n.data)
    const vh = (n.data.nodeH as number) || 110
    const vw = Math.max(18, fs * 1.2)
    const hw = (n.data.nodeW as number) || n.measured?.width || 80
    const hh = (n.data.nodeH as number) || fs * 1.6

    if (vert) {
      cells.push(`<mxCell id="${did}" value="&lt;font style=&quot;writing-mode: vertical-rl;&quot;&gt;${esc(n.data.label || '')}&lt;/font&gt;" style="whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;${ffStyle}" vertex="1" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(vw)}" height="${Math.round(vh)}" as="geometry"/></mxCell>`)
    } else {
      cells.push(rect(did, x, y, hw, hh, n.data.label || '', RECT + ffStyle))
    }
  })

  // 强制底部中心出、顶部中心入的正交路由
  edges.forEach((e) => {
    const sid = idMap.get(e.source); const tid = idMap.get(e.target)
    if (sid && tid) cells.push(edge(nid(), sid, tid, TREE_EDGE))
  })

  return wrap('功能结构图', cells.join('\n'))
}

// ====== Entity ======

export function entityDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const entities = nodes.filter((n) => n.type === 'rectangle')
  const cols = Math.ceil(Math.sqrt(entities.length))
  const cw = 400; const ch = 400; const co = 220

  entities.forEach((ent, ei) => {
    const ci = ei % cols; const ri = Math.floor(ei / cols)
    const bx = ci * cw; const by = ri * ch
    const cx = bx + 200; const cy = by + co
    const entEdges = edges.filter((e) => e.source === ent.id)
    const attrIds = new Set(entEdges.map((e) => e.target))
    const attrs = nodes.filter((n) => n.type === 'ellipse' && attrIds.has(n.id))
    const n = attrs.length
    const a = 100 + n * 10; const b = Math.round(a * 0.55)

    const eid = nid(); idMap.set(ent.id, eid)
    cells.push(rect(eid, cx - 45, cy - 18, 90, 36, ent.data.label || '', RECT + fontStyle(ent.data)))

    attrs.forEach((attr, ai) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * ai) / n
      const ax = cx + a * Math.cos(angle); const ay = cy + b * Math.sin(angle)
      const aid = nid(); idMap.set(attr.id, aid)
      cells.push(rect(aid, ax - 45, ay - 18, 90, 36, attr.data.label || '', ELLIPSE + fontStyle(attr.data)))
      cells.push(edge(nid(), eid, aid, LINE))
    })
  })

  return wrap('实体属性图', cells.join('\n'))
}

// ====== Sequence ======

export function sequenceDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const participants = nodes.filter(n => n.type === 'participant')
  const spacing = 200
  const startX = 100
  const startY = 50

  // 参与者
  participants.forEach((p, i) => {
    const pid = nid()
    idMap.set(p.id, pid)
    cells.push(rect(pid, startX + i * spacing, startY, 120, 50, p.data.label || '', RECT + 'verticalAlign=middle;'))

    // 生命线
    const lifelineId = nid()
    cells.push(`<mxCell id="${lifelineId}" value="" style="endArrow=none;dashed=1;html=1;strokeColor=#000000;strokeWidth=1;" edge="1" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint x="${startX + i * spacing + 60}" y="${startY + 50}" as="sourcePoint" />
        <mxPoint x="${startX + i * spacing + 60}" y="${startY + 50 + edges.length * 60 + 100}" as="targetPoint" />
      </mxGeometry>
    </mxCell>`)
  })

  // 消息
  edges.forEach((msg, i) => {
    const srcId = idMap.get(msg.source)
    const tgtId = idMap.get(msg.target)
    if (!srcId || !tgtId) return

    const msgId = nid()
    const srcIdx = participants.findIndex(p => p.id === msg.source)
    const tgtIdx = participants.findIndex(p => p.id === msg.target)
    const srcX = startX + srcIdx * spacing + 60
    const tgtX = startX + tgtIdx * spacing + 60
    const y = startY + 80 + i * 60

    const msgData = (msg as any).data || {}
    const msgType = msgData.messageType || 'sync'
    const arrowStyle = msgType === 'return' ? ARROW_DASHED : ARROW

    cells.push(`<mxCell id="${msgId}" value="${esc((msg as any).label || '')}" style="${arrowStyle}" edge="1" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint x="${srcX}" y="${y}" as="sourcePoint" />
        <mxPoint x="${tgtX}" y="${y}" as="targetPoint" />
      </mxGeometry>
    </mxCell>`)
  })

  return wrap('时序图', cells.join('\n'))
}

// ====== Class ======

export function classDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 200
  const startX = 100
  const startY = 60

  nodes.forEach((node, i) => {
    const cid = nid()
    idMap.set(node.id, cid)
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 250
    const w = 180
    const h = 120

    const attrs = (node.data as any).attributes || []
    const methods = (node.data as any).methods || []
    const stereotype = (node.data as any).stereotype
    const isAbstract = (node.data as any).isAbstract

    let label = node.data.label || ''
    if (stereotype) label = `«${stereotype}»\\n${label}`
    if (isAbstract) label = `<i>${label}</i>`

    // 类容器
    const CLASS_STYLE = 'swimlane;fontStyle=0;align=center;startSize=26;html=1;fillColor=#ffffff;strokeColor=#000000;'
    cells.push(`<mxCell id="${cid}" value="${esc(label)}" style="${CLASS_STYLE}" vertex="1" parent="1">
      <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />
    </mxCell>`)

    // 属性区域
    const attrId = nid()
    const attrText = attrs.join('\\n')
    const ATTR_STYLE = 'text;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;html=1;fillColor=#ffffff;strokeColor=#000000;'
    cells.push(`<mxCell id="${attrId}" value="${esc(attrText)}" style="${ATTR_STYLE}" vertex="1" parent="${cid}">
      <mxGeometry y="26" width="${w}" height="40" as="geometry" />
    </mxCell>`)

    // 方法区域
    const methodId = nid()
    const methodText = methods.join('\\n')
    cells.push(`<mxCell id="${methodId}" value="${esc(methodText)}" style="${ATTR_STYLE}" vertex="1" parent="${cid}">
      <mxGeometry y="66" width="${w}" height="54" as="geometry" />
    </mxCell>`)
  })

  // 关系
  edges.forEach((edge) => {
    const srcId = idMap.get(edge.source)
    const tgtId = idMap.get(edge.target)
    if (!srcId || !tgtId) return

    const relType = (edge as any).data?.relationType || 'association'
    let style = 'html=1;strokeColor=#000000;'

    switch (relType) {
      case 'inheritance':
        style += 'endArrow=block;endFill=0;'
        break
      case 'implementation':
        style += 'endArrow=block;endFill=0;dashed=1;'
        break
      case 'dependency':
        style += 'endArrow=open;endFill=0;dashed=1;'
        break
      case 'aggregation':
        style += 'endArrow=none;startArrow=diamond;startFill=0;'
        break
      case 'composition':
        style += 'endArrow=none;startArrow=diamond;startFill=1;'
        break
      default:
        style += 'endArrow=open;endFill=0;'
    }

    const edgeId = nid()
    cells.push(`<mxCell id="${edgeId}" value="${esc((edge as any).data?.label || '')}" style="${style}" edge="1" parent="1" source="${srcId}" target="${tgtId}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>`)
  })

  return wrap('类图', cells.join('\n'))
}

// ====== Activity ======

export function activityDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 150
  const startX = 100
  const startY = 60

  nodes.forEach((node, i) => {
    const nid2 = nid()
    idMap.set(node.id, nid2)
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 120

    switch (node.type) {
      case 'start':
        cells.push(`<mxCell id="${nid2}" value="" style="ellipse;fillColor=#000000;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="30" as="geometry" />
        </mxCell>`)
        break
      case 'end':
        cells.push(`<mxCell id="${nid2}" value="" style="ellipse;fillColor=#000000;strokeColor=#000000;strokeWidth=2;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="30" height="30" as="geometry" />
        </mxCell>`)
        break
      case 'decision':
        cells.push(`<mxCell id="${nid2}" value="${esc(node.data.label)}" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="60" height="60" as="geometry" />
        </mxCell>`)
        break
      default:
        cells.push(`<mxCell id="${nid2}" value="${esc(node.data.label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;arcSize=20;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="140" height="50" as="geometry" />
        </mxCell>`)
    }
  })

  // 流
  edges.forEach((edge) => {
    const srcId = idMap.get(edge.source)
    const tgtId = idMap.get(edge.target)
    if (!srcId || !tgtId) return

    const edgeId = nid()
    cells.push(`<mxCell id="${edgeId}" value="${esc((edge as any).data?.guard ? `[${(edge as any).data.guard}]` : '')}" style="${ARROW}" edge="1" parent="1" source="${srcId}" target="${tgtId}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>`)
  })

  return wrap('活动图', cells.join('\n'))
}

// ====== Deployment ======

export function deploymentDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 200
  const startX = 100
  const startY = 60

  nodes.forEach((node, i) => {
    const nid2 = nid()
    idMap.set(node.id, nid2)
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 200

    switch (node.type) {
      case 'server':
        cells.push(`<mxCell id="${nid2}" value="${esc(node.data.label)}" style="shape=cube;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;size=15;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="140" height="100" as="geometry" />
        </mxCell>`)
        break
      case 'database':
        cells.push(`<mxCell id="${nid2}" value="${esc(node.data.label)}" style="shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;size=15;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="100" height="80" as="geometry" />
        </mxCell>`)
        break
      default:
        cells.push(rect(nid2, x, y, 120, 60, node.data.label || ''))
    }

    // 技术栈标签
    if ((node.data as any).technology) {
      const techId = nid()
      cells.push(`<mxCell id="${techId}" value="${esc((node.data as any).technology)}" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;fontSize=10;fontColor=#666666;" vertex="1" parent="1">
        <mxGeometry x="${x}" y="${y + 100}" width="140" height="20" as="geometry" />
      </mxCell>`)
    }
  })

  // 通信路径
  edges.forEach((edge) => {
    const srcId = idMap.get(edge.source)
    const tgtId = idMap.get(edge.target)
    if (!srcId || !tgtId) return

    const edgeId = nid()
    cells.push(`<mxCell id="${edgeId}" value="${esc((edge as any).data?.label || '')}" style="html=1;strokeColor=#000000;endArrow=none;dashed=1;" edge="1" parent="1" source="${srcId}" target="${tgtId}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>`)
  })

  return wrap('部署图', cells.join('\n'))
}

// ====== ER Diagram (Chen-style) ======

export function erDrawio(nodes: DNode[], edges: Edge[]): string {
  let cellId = 2
  const nid = () => String(cellId++)
  const idMap = new Map<string, string>()
  const cells: string[] = []

  const entities = nodes.filter(n => n.type === 'erEntity')
  const diamonds = nodes.filter(n => n.type === 'erDiamond')

  // 按标签长度自适应实体宽度，保证「中文表名（english）」单行显示
  const entH = 46
  const cellH = 240
  const startX = 100
  const startY = 80
  const entWOf = (ent: DNode) =>
    Math.max(110, Math.min(260, Math.round(textWidth(String(ent.data.label || ''), fontSize(ent.data))) + 30))
  const maxEntW = entities.length ? Math.max(...entities.map(entWOf)) : 160
  const cellW = maxEntW + 150
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, entities.length))))

  // Track entity positions for diamond placement
  const entityPos = new Map<string, { x: number; y: number; w: number; cx: number; cy: number }>()

  // Entity rectangles（先收集，稍后与分组框按图层顺序统一输出）
  const entityCells: string[] = []
  entities.forEach((ent, i) => {
    const hasAI = ent.data.col !== undefined && ent.data.row !== undefined
    const col = hasAI ? Number(ent.data.col) : (i % cols)
    const row = hasAI ? Number(ent.data.row) : Math.floor(i / cols)
    
    const finalCol = isNaN(col) ? 0 : col
    const finalRow = isNaN(row) ? 0 : row

    const w = entWOf(ent)
    const hasAbs = typeof ent.data.x === 'number' && typeof ent.data.y === 'number'
    const x = hasAbs ? (ent.data.x as number) : startX + finalCol * cellW
    const y = hasAbs ? (ent.data.y as number) : startY + finalRow * cellH
    entityPos.set(ent.id, { x, y, w, cx: x + w / 2, cy: y + entH / 2 })

    const did = nid()
    idMap.set(ent.id, did)

    const fs = fontSize(ent.data)
    const ff = fontStyle(ent.data)
    entityCells.push(`<mxCell id="${did}" value="${esc(ent.data.label || '')}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;arcSize=8;${ff}fontStyle=1;fontSize=${fs};" vertex="1" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${w}" height="${entH}" as="geometry"/></mxCell>`)
  })

  // ===== 虚线分组框（置于最底层） =====
  const groupMembers = new Map<string, string[]>()
  entities.forEach((ent) => {
    const g = ent.data.group
    if (!g) return
    const list = groupMembers.get(g) || []
    list.push(ent.id)
    groupMembers.set(g, list)
  })
  const groupCells: string[] = []
  groupMembers.forEach((ids, label) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    ids.forEach((id) => {
      const p = entityPos.get(id)
      if (!p) return
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + p.w)
      maxY = Math.max(maxY, p.y + entH)
    })
    if (minX === Infinity) return
    const pad = 26
    const header = 26
    const gx = minX - pad
    const gy = minY - pad - header
    const gw = Math.max(maxX - minX + pad * 2, Math.round(textWidth(label, 12)) + 40)
    const gh = maxY - minY + pad * 2 + header
    const gid = nid()
    groupCells.push(`<mxCell id="${gid}" value="${esc(label)}" style="rounded=0;dashed=1;dashPattern=6 4;fillColor=none;strokeColor=#000000;html=1;verticalAlign=top;align=left;spacingLeft=10;spacingTop=6;fontSize=12;fontColor=#333333;" vertex="1" parent="1"><mxGeometry x="${Math.round(gx)}" y="${Math.round(gy)}" width="${Math.round(gw)}" height="${Math.round(gh)}" as="geometry"/></mxCell>`)
  })
  cells.push(...groupCells, ...entityCells)

  // 智能正交寻线（与 SVG 渲染共用同一引擎）
  const { relations, manual } = collectERRelations(
    diamonds.map((d) => ({ id: d.id, label: String(d.data.label || '') })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> | undefined })),
  )
  const routedById = new Map(
    routeRelations(
      entities.map((ent) => {
        const p = entityPos.get(ent.id)
        return { id: ent.id, x: p ? p.x : 0, y: p ? p.y : 0, w: p ? p.w : 120, h: entH }
      }),
      relations,
    ).map((r) => [r.id, r]),
  )
  const diaById = new Map(diamonds.map((d) => [d.id.replace(/^(dia_)+/, ''), d]))

  const diaW = 56
  const diaH = 32

  // 手动折线时的基数落点（带错开）
  const placedCards: { x: number; y: number }[] = []
  const manualCardAt = (pts: number[][], atEnd: boolean) => {
    const i0 = atEnd ? pts.length - 1 : 0
    const i1 = atEnd ? pts.length - 2 : 1
    const p0 = pts[i0]
    const p1 = pts[i1]
    const ddx = p1[0] - p0[0]
    const ddy = p1[1] - p0[1]
    const len = Math.hypot(ddx, ddy) || 1
    const dist = Math.min(30, len * 0.45)
    const x = p0[0] + (ddx / len) * dist
    const y = p0[1] + (ddy / len) * dist
    const horizontal = Math.abs(ddx) >= Math.abs(ddy)
    let px = horizontal ? x : x - 12
    let py = horizontal ? y - 9 : y
    let k = 0
    while (placedCards.some((c) => Math.hypot(c.x - px, c.y - py) < 16) && k < 12) {
      k++
      if (horizontal) py -= 15 * k
      else px -= 15 * k
    }
    placedCards.push({ x: px, y: py })
    return { x: px, y: py }
  }
  const cardCell = (value: string, x: number, y: number) =>
    `<mxCell id="${nid()}" value="${esc(value)}" style="text;html=1;align=center;verticalAlign=middle;fontStyle=1;fontSize=14;fontFamily=Arial, sans-serif;" vertex="1" parent="1"><mxGeometry x="${Math.round(x - 10)}" y="${Math.round(y - 10)}" width="20" height="20" as="geometry"/></mxCell>`

  // 逐条联系输出：菱形 + 完整正交折线 + 基数
  for (const rel of relations) {
    const dia = diaById.get(rel.id)
    if (!dia) continue
    const absX = dia.data.x as number | undefined
    const absY = dia.data.y as number | undefined
    const hasAbs = typeof absX === 'number' && typeof absY === 'number'
    const manualLine = manual.get(rel.id)

    let pts: number[][]
    let diamond: { x: number; y: number }
    let srcCardAt: { x: number; y: number } | null = null
    let tgtCardAt: { x: number; y: number } | null = null

    if (manualLine) {
      const n = manualLine.length
      pts = manualLine
      diamond = hasAbs ? { x: absX!, y: absY! } : { x: (manualLine[0][0] + manualLine[n - 1][0]) / 2, y: (manualLine[0][1] + manualLine[n - 1][1]) / 2 }
    } else {
      const rd = routedById.get(rel.id)
      if (!rd) continue
      pts = rd.points
      diamond = hasAbs ? { x: absX!, y: absY! } : rd.diamond
      srcCardAt = rd.srcCardAt
      tgtCardAt = rd.tgtCardAt
    }

    const diaId = nid()
    idMap.set(dia.id, diaId)
    const diaFs = fontSize(dia.data) || 14
    cells.push(`<mxCell id="${diaId}" value="${esc(dia.data.label || '')}" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;fontStyle=1;fontSize=${diaFs};fontFamily='SimHei', 'Heiti SC', sans-serif;" vertex="1" parent="1"><mxGeometry x="${Math.round(diamond.x - diaW / 2)}" y="${Math.round(diamond.y - diaH / 2)}" width="${diaW}" height="${diaH}" as="geometry"/></mxCell>`)

    const mid = pts.slice(1, -1).map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')
    cells.push(`<mxCell id="${nid()}" style="html=1;strokeColor=#000000;endArrow=none;startArrow=none;edgeStyle=none;rounded=0;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${pts[0][0]}" y="${pts[0][1]}" as="sourcePoint"/><mxPoint x="${pts[pts.length - 1][0]}" y="${pts[pts.length - 1][1]}" as="targetPoint"/><Array as="points">${mid}</Array></mxGeometry></mxCell>`)

    if (rel.srcCard) {
      const p = srcCardAt || manualCardAt(pts, false)
      cells.push(cardCell(rel.srcCard, p.x, p.y))
    }
    if (rel.tgtCard) {
      const p = tgtCardAt || manualCardAt(pts, true)
      cells.push(cardCell(rel.tgtCard, p.x, p.y))
    }
  }

  return wrap('总体ER图', cells.join('\n'))
}

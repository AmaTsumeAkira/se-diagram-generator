import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'
import { layoutTreeStructure } from './layout'

type DNode = Node<DiagramNodeData>

// ====== Drawio XML helpers ======

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

let cellId = 2
function nid() { return String(cellId++) }

const RECT = 'whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;'
const ELLIPSE = 'ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;'
const STEP = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;startArrow=none;endArrow=none;'
const TREE_EDGE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=8;html=1;strokeColor=#000000;startArrow=none;endArrow=none;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;'
const LINE = 'html=1;strokeColor=#000000;startArrow=none;endArrow=none;'
const ARROW = 'endArrow=block;html=1;strokeColor=#000000;'

function rect(id: string, x: number, y: number, w: number, h: number, label: string, st = RECT) {
  return `<mxCell id="${id}" value="${esc(label)}" style="${st}" vertex="1" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" as="geometry"/></mxCell>`
}

function edge(id: string, src: string, tgt: string, st = LINE) {
  return `<mxCell id="${id}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>`
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
  cellId = 2
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
      let w = 0; for (const ch of (uc.data.label as string)) w += ch.charCodeAt(0) > 127 ? 14 : 8
      return Math.max(m, w)
    }, 0)
    const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

    // 火柴人用矩形 + 无填充模拟
    const aid = nid(); idMap.set(g.actor.id, aid)
    cells.push(rect(aid, bx + 15, ay, 55, 100, g.actor.data.label as string, RECT + 'fillColor=none;verticalAlign=bottom;verticalLabelPosition=bottom;'))

    g.useCases.forEach((uc, ui) => {
      const uid = nid(); idMap.set(uc.id, uid)
      cells.push(rect(uid, ux - rx, sy + ui * sp - 15, rx * 2, 30, uc.data.label as string, ELLIPSE))
      cells.push(edge(nid(), aid, uid, ARROW))
    })
    gi++
  })

  return wrap('用例图', cells.join('\n'))
}

// ====== Structure (drawio原生正交路由) ======

export function structureDrawio(nodes: DNode[], edges: Edge[]): string {
  cellId = 2
  const { nodes: ln } = layoutTreeStructure(nodes, edges)
  const idMap = new Map<string, string>()
  const cells: string[] = []

  ln.forEach((n) => {
    const did = nid(); idMap.set(n.id, did)
    const x = n.position.x; const y = n.position.y
    const vert = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const vh = (n.data.nodeH as number) || 110
    const vw = Math.max(18, fs * 1.2)
    const hw = (n.data.nodeW as number) || n.measured?.width || 80
    const hh = (n.data.nodeH as number) || fs * 1.6

    if (vert) {
      cells.push(`<mxCell id="${did}" value="&lt;font style=&quot;writing-mode: vertical-rl;&quot;&gt;${esc(n.data.label as string)}&lt;/font&gt;" style="whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(vw)}" height="${Math.round(vh)}" as="geometry"/></mxCell>`)
    } else {
      cells.push(rect(did, x, y, hw, hh, n.data.label as string))
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
  cellId = 2
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
    cells.push(rect(eid, cx - 45, cy - 18, 90, 36, ent.data.label as string))

    attrs.forEach((attr, ai) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * ai) / n
      const ax = cx + a * Math.cos(angle); const ay = cy + b * Math.sin(angle)
      const aid = nid(); idMap.set(attr.id, aid)
      cells.push(rect(aid, ax - 45, ay - 18, 90, 36, attr.data.label as string, ELLIPSE))
      cells.push(edge(nid(), eid, aid, LINE))
    })
  })

  return wrap('实体属性图', cells.join('\n'))
}

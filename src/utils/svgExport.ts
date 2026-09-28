import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData, ERField, ERNotation } from '../types/diagram'
import { layoutTreeStructure } from './layout'
import { collectERRelations, routeRelations, scoreLayout, anchorOutside } from './erRouting'
import { rankOfFlow, layeredLayoutOf } from './layout'
import { estimateEntityWidth, ringOrderedCells, ER_ENTITY_FONT } from './erLayout'

type DNode = Node<DiagramNodeData>

// ====== Helpers ======

function esc(s: string) {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeLabel(data: Record<string, unknown>): string {
  return (data.label as string) || ''
}

function fontSize(data?: Record<string, unknown>): number {
  return (data?.fontSize as number) || 14
}

function fontFamily(data?: Record<string, unknown>): string {
  return (data?.fontFamily as string) || 'SimSun'
}

function textWidth(s: string, fs: number): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? fs : fs * 0.6
  return w
}

function bounds(nodes: { x: number; y: number; w?: number; h?: number }[]) {
  if (nodes.length === 0) return { x: 0, y: 0, w: 400, h: 300 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + (n.w || 80)); maxY = Math.max(maxY, n.y + (n.h || 30))
  })
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function openMarkerDef(id: string) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="#000" stroke-width="1.5"/></marker>`
}

function markerDef(id: string) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000"/></marker>`
}

// ====== Use Case SVG ======

export function useCaseSvg(nodes: DNode[], edges: Edge[]): string {
  const groups = new Map<string, { actor: DNode; useCases: DNode[] }>()
  const actors = nodes.filter((n) => n.type === 'actor')
  actors.forEach((a) => {
    const ucIds = new Set(edges.filter((e) => e.source === a.id).map((e) => e.target))
    groups.set(a.id, { actor: a, useCases: nodes.filter((n) => n.type === 'usecase' && ucIds.has(n.id)) })
  })

  const cols = Math.ceil(Math.sqrt(groups.size))
  const cellW = 380; const spacing = 48
  let svg = ''; const boxes: { x: number; y: number; w: number; h: number }[] = []
  let gi = 0

  groups.forEach((g) => {
    const ci = gi % cols; const ri = Math.floor(gi / cols)
    const baseX = ci * cellW; const baseY = ri * 360
    const actorY = baseY + 160
    const ucBlockH = (g.useCases.length - 1) * spacing + 30
    const startY = baseY + 140 - ucBlockH / 2
    const ucCx = baseX + 280
    const maxW = g.useCases.reduce((m, uc) => {
      const lbl = safeLabel(uc.data)
      return Math.max(m, textWidth(lbl, fontSize(uc.data)))
    }, 0)
    const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

    // stick figure
    const ax = baseX + 40; const ay = actorY
    const actorFs = fontSize(g.actor.data)
    const actorFont = esc(fontFamily(g.actor.data))
    svg += `<g stroke="#000" stroke-width="1.5" fill="none"><circle cx="${ax + 27}" cy="${ay + 12}" r="10"/><line x1="${ax + 27}" y1="${ay + 22}" x2="${ax + 27}" y2="${ay + 68}"/><line x1="${ax + 27}" y1="${ay + 40}" x2="${ax}" y2="${ay + 40}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 10}" y2="${ay + 102}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 44}" y2="${ay + 102}"/></g>`
    svg += `<text x="${ax + 27}" y="${ay + 120}" font-family="${actorFont}" font-size="${actorFs}" text-anchor="middle" fill="#000">${esc(safeLabel(g.actor.data))}</text>`

    // use case ellipses + lines
    g.useCases.forEach((uc, ui) => {
      const ucy = startY + ui * spacing
      const ucFs = fontSize(uc.data)
      const ucFont = esc(fontFamily(uc.data))
      svg += `<line x1="${ax + 55}" y1="${ay + 40}" x2="${ucCx - rx}" y2="${ucy}" stroke="#000" stroke-width="1" marker-end="url(#arrow)"/>`
      svg += `<ellipse cx="${ucCx}" cy="${ucy}" rx="${rx}" ry="15" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${ucCx}" y="${ucy + ucFs * 0.35}" font-family="${ucFont}" font-size="${ucFs}" text-anchor="middle" fill="#000">${esc(safeLabel(uc.data))}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: 360 })
    gi++
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Structure SVG ======

/**
 * 结构图节点的方框几何（唯一定义）。
 *
 * 必须让「画方框」和「画连线」共用同一个尺寸函数：此前连线只认 `measured.width || 80`，
 * 而方框还有「按字数估算宽度」的兜底，导致长标签节点（如根节点「公寓报修管理系统」
 * 实际宽 121.6px）的竖线从 x+40 而不是 x+60.8 下垂 —— 所有竖线都不居中。
 */
export function structureBox(n: DNode): { w: number; h: number } {
  const fs = (n.data.fontSize as number) || 14
  if (n.data.vertical) {
    return { w: Math.max(18, fs * 1.2), h: (n.data.nodeH as number) || 110 }
  }
  const label = String(n.data.label ?? '')
  const h = (n.data.nodeH as number) || fs * 1.6
  const w = (n.data.nodeW as number) || n.measured?.width || Math.max(80, label.length * fs * 0.8 + 32)
  return { w, h }
}

export function structureSvg(nodes: DNode[], edges: Edge[]): string {
  const { nodes: ln } = layoutTreeStructure(nodes, edges)
  const nodeMap = new Map(ln.map((n) => [n.id, n]))
  let svg = ''

  ln.forEach((n) => {
    const x = n.position.x; const y = n.position.y
    const rawLabel = safeLabel(n.data)
    const label = esc(rawLabel)
    const vert = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const ff = esc(fontFamily(n.data))
    const { w, h } = structureBox(n)

    if (vert) {
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="1"/>`
      // vertical text char by char
      const chars = rawLabel.split('')
      const ls = Math.max(1, fs * 0.15)
      const charH = fs + ls
      const startY = y + (h - chars.length * charH + ls) / 2 + fs * 0.8
      chars.forEach((ch, ci) => {
        svg += `<text x="${x + w / 2}" y="${startY + ci * charH}" font-family="${ff}" font-size="${fs}" text-anchor="middle" fill="#000">${esc(ch)}</text>`
      })
    } else {
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${x + w / 2}" y="${y + h / 2 + fs * 0.3}" font-family="${ff}" font-size="${fs}" text-anchor="middle" fill="#000">${label}</text>`
    }
  })

  // step edges —— 竖线一律从父框「底边中点」出发、落在子框「顶边中点」上
  edges.forEach((e) => {
    const src = nodeMap.get(e.source); const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return
    const sb = structureBox(src); const tb = structureBox(tgt)
    const sx = src.position.x + sb.w / 2
    const sy = src.position.y + sb.h
    const tx = tgt.position.x + tb.w / 2
    const ty = tgt.position.y
    const oy = (ty - sy) / 2
    svg += `<path d="M ${sx} ${sy} L ${sx} ${sy + oy} L ${tx} ${sy + oy} L ${tx} ${ty}" fill="none" stroke="#000" stroke-width="1"/>`
  })

  const bb = bounds(ln.map((n) => ({ x: n.position.x, y: n.position.y, ...structureBox(n) })))
  return wrapSvg(svg, bb.x - 20, bb.y - 20, bb.w + 40, bb.h + 40)
}

// ====== Entity SVG ======

export function entitySvg(nodes: DNode[], edges: Edge[]): string {
  const entities = nodes.filter((n) => n.type === 'rectangle')
  const cols = Math.ceil(Math.sqrt(entities.length))
  const cellW = 400; const cellH = 400
  const cyOff = 220
  let svg = ''; const boxes: { x: number; y: number; w: number; h: number }[] = []

  entities.forEach((ent, ei) => {
    const ci = ei % cols; const ri = Math.floor(ei / cols)
    const baseX = ci * cellW; const baseY = ri * cellH
    const cx = baseX + 200; const cy = baseY + cyOff
    const entEdges = edges.filter((e) => e.source === ent.id)
    const entFs = fontSize(ent.data)
    const entFont = esc(fontFamily(ent.data))
    const attrIds = new Set(entEdges.map((e) => e.target))
    const attrs = nodes.filter((n) => n.type === 'ellipse' && attrIds.has(n.id))
    const n = attrs.length
    const a = 100 + n * 10; const b = Math.round(a * 0.55)

    // entity rectangle
    const ew = 90; const eh = 36
    svg += `<rect x="${cx - ew / 2}" y="${cy - eh / 2}" width="${ew}" height="${eh}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svg += `<text x="${cx}" y="${cy + entFs * 0.35}" font-family="${entFont}" font-size="${entFs}" text-anchor="middle" fill="#000">${esc(safeLabel(ent.data))}</text>`

    // attributes + lines
    attrs.forEach((attr, ai) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * ai) / n
      const ax = cx + a * Math.cos(angle); const ay = cy + b * Math.sin(angle)
      const rx = 45; const ry = 18
      const attrFs = fontSize(attr.data)
      const attrFont = esc(fontFamily(attr.data))
      svg += `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#000" stroke-width="1.2"/>`
      svg += `<ellipse cx="${ax}" cy="${ay}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="1.2"/>`
      svg += `<text x="${ax}" y="${ay + attrFs * 0.35}" font-family="${attrFont}" font-size="${attrFs}" text-anchor="middle" fill="#000">${esc(safeLabel(attr.data))}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: cellH })
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

function wrapSvg(content: string, x: number, y: number, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${content}</svg>`
}

// ====== Sequence SVG ======

interface BoxRect {
  cx: number
  cy: number
  x: number
  y: number
  w: number
  h: number
}

/**
 * 把"中心 → 中心"的连线裁剪到两个矩形的边界上。
 *
 * 不裁剪会让箭头落在目标框内部（继承/实现是空心三角，直接被框盖住看不出来），
 * 类图 / 活动图 / 部署图的连接线都会受影响。
 */
function clipToBoxes(a: BoxRect, b: BoxRect): { sx: number; sy: number; tx: number; ty: number } {
  const edgeOf = (r: BoxRect, to: { cx: number; cy: number }) => {
    const dx = to.cx - r.cx
    const dy = to.cy - r.cy
    if (dx === 0 && dy === 0) return { x: r.cx, y: r.cy }
    const tx = dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity
    const ty = dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity
    const t = Math.min(tx, ty)
    return { x: r.cx + dx * t, y: r.cy + dy * t }
  }
  const s = edgeOf(a, b)
  const t = edgeOf(b, a)
  return { sx: s.x, sy: s.y, tx: t.x, ty: t.y }
}

export function sequenceSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const participants = nodes.filter(n => n.type === 'participant')
  const spacing = 200
  const startX = 100
  const startY = 50

  const msgTop = startY + 110
  const lifelineBottom = msgTop + edges.length * 60 + 40

  // 参与者：角色画小人、数据库画圆柱（编辑器可切换类型，之前一律画成矩形）
  participants.forEach((p, i) => {
    const cx = startX + i * spacing + 60
    const type = (p.data.participantType as string) || 'system'
    const label = esc(safeLabel(p.data))
    let headH = 50

    if (type === 'actor') {
      headH = 80
      svg += `<circle cx="${cx}" cy="${startY + 12}" r="10" fill="none" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx}" y1="${startY + 22}" x2="${cx}" y2="${startY + 46}" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx - 14}" y1="${startY + 32}" x2="${cx + 14}" y2="${startY + 32}" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx}" y1="${startY + 46}" x2="${cx - 12}" y2="${startY + 62}" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx}" y1="${startY + 46}" x2="${cx + 12}" y2="${startY + 62}" stroke="#000" stroke-width="1.5"/>`
      svg += `<text x="${cx}" y="${startY + 76}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    } else if (type === 'database') {
      headH = 64
      svg += `<ellipse cx="${cx}" cy="${startY + 12}" rx="56" ry="12" fill="#fff" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx - 56}" y1="${startY + 12}" x2="${cx - 56}" y2="${startY + 52}" stroke="#000" stroke-width="1.5"/>`
      svg += `<line x1="${cx + 56}" y1="${startY + 12}" x2="${cx + 56}" y2="${startY + 52}" stroke="#000" stroke-width="1.5"/>`
      svg += `<path d="M ${cx - 56} ${startY + 52} A 56 12 0 0 0 ${cx + 56} ${startY + 52}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
      svg += `<text x="${cx}" y="${startY + 36}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    } else {
      svg += `<rect x="${cx - 60}" y="${startY}" width="120" height="50" fill="#fff" stroke="#000" stroke-width="1.5"/>`
      svg += `<text x="${cx}" y="${startY + 30}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    }

    // 生命线：从图形底部往下
    svg += `<line x1="${cx}" y1="${startY + headH}" x2="${cx}" y2="${lifelineBottom}" stroke="#000" stroke-width="1" stroke-dasharray="5,5"/>`
    boxes.push({ x: cx - 60, y: startY, w: 120, h: lifelineBottom - startY })
  })

  // 消息：同步=实线+实心箭头，异步=实线+开放箭头，返回=虚线+开放箭头
  edges.forEach((msg, i) => {
    const srcIdx = participants.findIndex(p => p.id === msg.source)
    const tgtIdx = participants.findIndex(p => p.id === msg.target)
    if (srcIdx === -1 || tgtIdx === -1) return

    const srcX = startX + srcIdx * spacing + 60
    const tgtX = startX + tgtIdx * spacing + 60
    const y = msgTop + i * 60

    const msgData = (msg.data as any) || {}
    const msgType = msgData.messageType || 'sync'
    const dashAttr = msgType === 'return' ? ' stroke-dasharray="6,3"' : ''
    const marker = msgType === 'sync' ? 'url(#arrow)' : 'url(#open-arrow)'
    svg += `<line x1="${srcX}" y1="${y}" x2="${tgtX}" y2="${y}" stroke="#000" stroke-width="1.5" marker-end="${marker}"${dashAttr}/>`

    // 消息文字标签
    const msgLabel = (msg.label as string) || msgData.label || ''
    if (msgLabel) {
      const midX = (srcX + tgtX) / 2
      svg += `<text x="${midX}" y="${y - 8}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#333">${esc(msgLabel)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markerDef('arrow') + openMarkerDef('open-arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Class SVG ======

export function classSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const startX = 100
  const startY = 60

  const nodeBounds = new Map<string, BoxRect>()

  // 先算每个类的高度与行距（原来行距固定 250：成员多的类会互相压住）
  const meta = nodes.map((node) => {
    const attrs = ((node.data as any).attributes as string[]) || []
    const methods = ((node.data as any).methods as string[]) || []
    const type = String(node.type || 'class')
    const stereotype =
      ((node.data.stereotype as string) ||
        (type === 'interface' ? 'interface' : type === 'enum' ? 'enumeration' : '')) || undefined
    const attrH = Math.max(attrs.length * 18 + 8, 30)
    const methodH = Math.max(methods.length * 18 + 8, 30)
    const headerH = stereotype ? 36 : 26
    return { node, attrs, methods, stereotype, attrH, methodH, headerH, h: headerH + attrH + methodH }
  })
  // 与 drawio 侧共用同一套"按依赖深度分层"的布局，保证屏幕与导出图一致
  const layout = layeredLayoutOf(
    meta.map((m) => ({ id: m.node.id, w: 180, h: m.h })),
    edges.map((e) => ({ source: e.source, target: e.target })),
    {
      hGap: 70,
      vGap: 90,
      startX,
      startY,
      // 与 drawio 侧同一套分层规则：只有继承/实现决定层号
      rankEdges: edges
        .filter((e) =>
          ['inheritance', 'implementation'].includes(String((e.data as { relationType?: string } | undefined)?.relationType)),
        )
        .map((e) => ({ source: e.source, target: e.target })),
    },
  )

  meta.forEach((m) => {
    const at = layout.get(m.node.id) || { x: startX, y: startY }
    const x = at.x
    const y = at.y
    const width = 180
    const { attrs, methods, stereotype, attrH, headerH } = m
    const isAbstract = !!(m.node.data as any).isAbstract
    const italic = isAbstract ? ' font-style="italic"' : ''

    svg += `<rect x="${x}" y="${y}" width="${width}" height="${m.h}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${headerH}" fill="#f0f0f0" stroke="#000" stroke-width="1"/>`
    if (stereotype) {
      // 构造型（«interface» / «enumeration» …）画在类名上方
      svg += `<text x="${x + width / 2}" y="${y + 14}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#333">\u00ab${esc(stereotype)}\u00bb</text>`
      svg += `<text x="${x + width / 2}" y="${y + 29}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000"${italic}>${esc(safeLabel(m.node.data))}</text>`
    } else {
      svg += `<text x="${x + width / 2}" y="${y + 18}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000"${italic}>${esc(safeLabel(m.node.data))}</text>`
    }
    svg += `<line x1="${x}" y1="${y + headerH}" x2="${x + width}" y2="${y + headerH}" stroke="#000" stroke-width="1"/>`
    attrs.forEach((attr, j) => {
      svg += `<text x="${x + 4}" y="${y + headerH + 16 + j * 18}" font-family="sans-serif" font-size="10" fill="#000">${esc(attr)}</text>`
    })
    svg += `<line x1="${x}" y1="${y + headerH + attrH}" x2="${x + width}" y2="${y + headerH + attrH}" stroke="#000" stroke-width="1"/>`
    methods.forEach((method, j) => {
      svg += `<text x="${x + 4}" y="${y + headerH + attrH + 16 + j * 18}" font-family="sans-serif" font-size="10" fill="#000">${esc(method)}</text>`
    })

    boxes.push({ x, y, w: width, h: m.h })
    nodeBounds.set(m.node.id, { cx: x + width / 2, cy: y + m.h / 2, x, y, w: width, h: m.h })
  })

  const markers: string[] = []
  markers.push(markerDef('arrow'))
  markers.push(`<marker id="hollow-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" stroke="#000" stroke-width="1"/></marker>`)
  markers.push(`<marker id="diamond" viewBox="0 0 12 8" refX="0" refY="4" markerWidth="10" markerHeight="8" orient="auto"><path d="M 0 4 L 6 0 L 12 4 L 6 8 z" fill="#fff" stroke="#000" stroke-width="1"/></marker>`)
  markers.push(`<marker id="filled-diamond" viewBox="0 0 12 8" refX="0" refY="4" markerWidth="10" markerHeight="8" orient="auto"><path d="M 0 4 L 6 0 L 12 4 L 6 8 z" fill="#000" stroke="#000" stroke-width="1"/></marker>`)

  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    // 裁剪到两个框的边界：否则空心三角（继承/实现）会落在目标框内部，被框盖住看不见
    const { sx, sy, tx, ty } = clipToBoxes(src, tgt)

    const relData = (edge.data as any) || {}
    const relType = relData.relationType || 'association'

    const strokeAttr = 'stroke="#000" stroke-width="1.5"'
    let dashAttr = ''
    let markerStart = ''
    let markerEnd = `marker-end="url(#arrow)"`

    switch (relType) {
      case 'inheritance':
        markerEnd = `marker-end="url(#hollow-arrow)"`
        break
      case 'implementation':
        dashAttr = ' stroke-dasharray="8,4"'
        markerEnd = `marker-end="url(#hollow-arrow)"`
        break
      case 'dependency':
        dashAttr = ' stroke-dasharray="8,4"'
        break
      case 'aggregation':
        markerStart = `marker-start="url(#diamond)"`
        markerEnd = ''
        break
      case 'composition':
        markerStart = `marker-start="url(#filled-diamond)"`
        markerEnd = ''
        break
      default:
        break
    }

    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" ${strokeAttr}${dashAttr} ${markerStart} ${markerEnd}/>`

    const label = relData.label || ''
    if (label) {
      svg += `<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 6}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${esc(label)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markers.join('') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}
// ====== Activity SVG ======

export function activitySvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const startX = 100
  const startY = 60
  const cellW = 200
  const rowPitch = 130

  const nodeBounds = new Map<string, BoxRect>()

  // 活动图按流程方向分层、同层横向居中（原来是 sqrt 网格，流程顺序会被打乱）
  const rank = rankOfFlow(nodes, edges)
  const byRank = new Map<number, string[]>()
  nodes.forEach((n) => {
    const r = rank.get(n.id) ?? 0
    const list = byRank.get(r)
    if (list) list.push(n.id)
    else byRank.set(r, [n.id])
  })
  const sizeOf = (t?: string) =>
    t === 'start' || t === 'end' ? { w: 30, h: 30 } : t === 'decision' ? { w: 80, h: 80 } : { w: 150, h: 50 }
  const maxCols = Math.max(1, ...[...byRank.values()].map((v) => v.length))
  const totalW = maxCols * cellW

  nodes.forEach((node) => {
    const r = rank.get(node.id) ?? 0
    const row = byRank.get(r) || [node.id]
    const col = row.indexOf(node.id)
    const size = sizeOf(node.type)
    const x = startX + (totalW - row.length * cellW) / 2 + col * cellW + (cellW - size.w) / 2
    const y = startY + r * rowPitch + (rowPitch - size.h) / 2
    const label = esc(safeLabel(node.data))

    switch (node.type) {
      case 'start':
        svg += `<circle cx="${x + size.w / 2}" cy="${y + size.h / 2}" r="14" fill="#000" stroke="#000" stroke-width="2"/>`
        break
      case 'end':
        svg += `<circle cx="${x + size.w / 2}" cy="${y + size.h / 2}" r="14" fill="none" stroke="#000" stroke-width="2"/>`
        svg += `<circle cx="${x + size.w / 2}" cy="${y + size.h / 2}" r="10" fill="#000"/>`
        break
      case 'decision':
        svg += `<polygon points="${x + size.w / 2},${y} ${x + size.w},${y + size.h / 2} ${x + size.w / 2},${y + size.h} ${x},${y + size.h / 2}" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<text x="${x + size.w / 2}" y="${y + size.h / 2 + 4}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#000">${label}</text>`
        break
      default:
        svg += `<rect x="${x}" y="${y}" width="${size.w}" height="${size.h}" rx="10" ry="10" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<text x="${x + size.w / 2}" y="${y + size.h / 2 + 4}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    }

    boxes.push({ x, y, w: size.w, h: size.h })
    nodeBounds.set(node.id, { cx: x + size.w / 2, cy: y + size.h / 2, x, y, w: size.w, h: size.h })
  })

  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    // 同样裁剪到边界，箭头落在图形轮廓上而不是内部
    const { sx, sy, tx, ty } = clipToBoxes(src, tgt)
    const flowData = (edge.data as any) || {}
    const guard = flowData.guard || flowData.label || ''

    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#000" stroke-width="1.5" marker-end="url(#arrow)"/>`
    if (guard) {
      svg += `<text x="${(sx + tx) / 2 + 6}" y="${(sy + ty) / 2 - 4}" font-family="sans-serif" font-size="10" fill="#555">[${esc(guard)}]</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}
// ====== Deployment SVG ======

export function deploymentSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const spacing = 220
  const startX = 100
  const startY = 60

  const nodeBounds = new Map<string, BoxRect>()

  // 各类型尺寸/构造型：服务器=立方体、数据库=圆柱，其余用 «component»/«artifact»/«device» 标注
  const sizeOf = (t?: string) => (t === 'database' || t === 'server' ? { w: 140, h: 100 } : { w: 150, h: 80 })
  const stereotypeOf = (t?: string) =>
    t === 'component' ? 'component' : t === 'artifact' ? 'artifact' : t === 'node' ? 'device' : ''

  nodes.forEach((node, i) => {
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 220
    const size = sizeOf(node.type)
    const label = esc(safeLabel(node.data))
    const stereo = stereotypeOf(node.type)

    if (node.type === 'server') {
      svg += `<path d="M ${x + 10} ${y + 25} L ${x + 10} ${y + size.h - 10} L ${x + size.w - 10} ${y + size.h - 10} L ${x + size.w - 10} ${y + 25} L ${x + size.w / 2} ${y + 5} L ${x + 10} ${y + 25} Z" fill="#fff" stroke="#000" stroke-width="2"/>`
      svg += `<line x1="${x + 10}" y1="${y + 25}" x2="${x + size.w - 10}" y2="${y + 25}" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${x + size.w / 2}" y="${y + size.h / 2 + 8}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    } else if (node.type === 'database') {
      const ry = 12
      const rx = size.w / 2 - 5
      svg += `<ellipse cx="${x + size.w / 2}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="2"/>`
      svg += `<line x1="${x + 5}" y1="${y + ry}" x2="${x + 5}" y2="${y + size.h - ry}" stroke="#000" stroke-width="2"/>`
      svg += `<line x1="${x + size.w - 5}" y1="${y + ry}" x2="${x + size.w - 5}" y2="${y + size.h - ry}" stroke="#000" stroke-width="2"/>`
      svg += `<path d="M ${x + 5} ${y + size.h - ry} A ${rx} ${ry} 0 0 0 ${x + size.w - 5} ${y + size.h - ry}" fill="#fff" stroke="#000" stroke-width="2"/>`
      svg += `<text x="${x + size.w / 2}" y="${y + size.h / 2 + 8}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#000">${label}</text>`
    } else {
      svg += `<rect x="${x}" y="${y}" width="${size.w}" height="${size.h}" fill="#fff" stroke="#000" stroke-width="2"/>`
      const nameY = stereo ? y + size.h / 2 + 2 : y + size.h / 2 + 4
      if (stereo) {
        svg += `<text x="${x + size.w / 2}" y="${y + size.h / 2 - 12}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#333">\u00ab${stereo}\u00bb</text>`
      }
      svg += `<text x="${x + size.w / 2}" y="${nameY}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${label}</text>`
    }

    // 技术栈：贴在节点下方（drawio 侧也这么做，保持两边一致）
    const tech = node.data.technology as string | undefined
    if (tech) {
      svg += `<text x="${x + size.w / 2}" y="${y + size.h + 14}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#666">${esc(tech)}</text>`
    }

    boxes.push({ x, y, w: size.w, h: size.h + (tech ? 20 : 0) })
    nodeBounds.set(node.id, { cx: x + size.w / 2, cy: y + size.h / 2, x, y, w: size.w, h: size.h })
  })

  // 通信路径：虚线；裁剪到节点边界
  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    const { sx, sy, tx, ty } = clipToBoxes(src, tgt)
    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#000" stroke-width="1.5" stroke-dasharray="8,4"/>`

    const label = (edge.label as string) || (edge.data as any)?.label || ''
    if (label) {
      svg += `<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 6}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${esc(label)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}
// ====== ER Diagram SVG (Chen-style) ======

/** ER 实体定位结果 */
export interface ErPlaced {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

/**
 * ER 实体定位（四种表示法共用）。
 * 优先级：绝对坐标 (data.x/data.y) > 行列表格 (data.row/col) > 空位搜索。
 * 说明：编辑器里新增的实体没有坐标。若图上已有绝对坐标的实体，仍按 i%autoCols
 * 铺网格会与已有实体贴住（净空不足），或按全局序号被甩到画布下方很远的位置；
 * 因此改为在网格里找第一个与已有实体保持净空的空位。
 */
function placeErEntities(
  entities: DNode[],
  entWOf: (ent: DNode) => number,
  heightOf: (ent: DNode) => number = () => 44,
): Map<string, ErPlaced> {
  const cellH = 240
  const startX = 120
  const startY = 90
  const maxEntW = entities.length ? Math.max(...entities.map(entWOf)) : 180
  const cellW = maxEntW + 150
  const hasAbsEntity = entities.some((ent) => typeof ent.data.x === 'number' && typeof ent.data.y === 'number')
  const hasGridEntity = entities.some((ent) => ent.data.row !== undefined && ent.data.col !== undefined)
  const useGrid = hasGridEntity && !hasAbsEntity
  const autoCols = entities.length ? Math.max(2, Math.ceil(Math.sqrt(entities.length))) : 2

  /** 已被占用的矩形（预先收集绝对坐标的，避免与后加入的实体抢位） */
  const occupied: { x: number; y: number; w: number; h: number }[] = entities
    .filter((ent) => typeof ent.data.x === 'number' && typeof ent.data.y === 'number')
    .map((ent) => ({ x: ent.data.x as number, y: ent.data.y as number, w: entWOf(ent), h: heightOf(ent) }))

  const GAP_SLOT = 30
  const hitsOccupied = (a: { x: number; y: number; w: number; h: number }) =>
    occupied.some(
      (o) =>
        !(
          a.x + a.w + GAP_SLOT <= o.x ||
          o.x + o.w + GAP_SLOT <= a.x ||
          a.y + a.h + GAP_SLOT <= o.y ||
          o.y + o.h + GAP_SLOT <= a.y
        ),
    )

  const freeSlot = (w: number, h: number): { x: number; y: number } => {
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < autoCols; c++) {
        const slot = { x: startX + c * cellW, y: startY + r * cellH, w, h }
        if (!hitsOccupied(slot)) {
          occupied.push(slot)
          return { x: slot.x, y: slot.y }
        }
      }
    }
    const fallback = { x: startX, y: startY + 30 * cellH, w, h }
    occupied.push(fallback)
    return { x: fallback.x, y: fallback.y }
  }

  const pos = new Map<string, ErPlaced>()
  entities.forEach((ent, i) => {
    const w = entWOf(ent)
    const h = heightOf(ent)
    let x: number
    let y: number
    if (typeof ent.data.x === 'number' && typeof ent.data.y === 'number') {
      x = ent.data.x
      y = ent.data.y
    } else if (useGrid && ent.data.row !== undefined && ent.data.col !== undefined) {
      const col = Number(ent.data.col)
      const row = Number(ent.data.row)
      x = startX + (isNaN(col) ? 0 : col) * cellW
      y = startY + (isNaN(row) ? 0 : row) * cellH
    } else if (useGrid) {
      x = startX + (i % autoCols) * cellW
      y = startY + Math.floor(i / autoCols) * cellH
    } else {
      const slot = freeSlot(w, h)
      x = slot.x
      y = slot.y
    }
    pos.set(ent.id, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 })
  })
  return pos
}

/** 陈氏表示法（实体 + 菱形联系 + 基数），即原有实现 */
function erSvgChen(nodes: DNode[], edges: Edge[]): string {
  const entities = nodes.filter(n => n.type === 'erEntity')
  const diamonds = nodes.filter(n => n.type === 'erDiamond')

  const entH = 44
  const diaR = 16
  const diaHalf = 28
  // 框宽与布局端共用同一套估算（字号 14），避免"算出来的宽度"和"画出来的宽度"不一致
  const entWOf = (ent: DNode) =>
    estimateEntityWidth(String(ent.data.label || ''), (ent.data.fontSize as number) || ER_ENTITY_FONT)

  // ====== 1. 实体位置（四种表示法共用）======
  const entityPos = placeErEntities(entities, entWOf)

  // ====== 2. 解析联系 + 智能正交寻线（干线共用 / 避障 / 落点自动） ======
  const { relations, manual } = collectERRelations(
    diamonds.map((d) => ({ id: d.id, label: String(d.data.label || '') })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> | undefined })),
  )

  const routedList = routeRelations(
    entities.map((ent) => {
      const p = entityPos.get(ent.id)
      return { id: ent.id, x: p ? p.x : 0, y: p ? p.y : 0, w: p ? p.w : 120, h: entH }
    }),
    relations,
  )
  const routedById = new Map(routedList.map((r) => [r.id, r]))
  const diaById = new Map(diamonds.map((d) => [d.id.replace(/^(dia_)+/, ''), d]))

  // 手动折线（data.line）时的基数落点：先走出实体盒，再沿路径错开
  const placedCards: { x: number; y: number }[] = []
  const manualCardAt = (pts: number[][], atEnd: boolean, entId?: string) => {
    const pos = entId ? entityPos.get(entId) : undefined
    let x: number, y: number, horizontal: boolean
    if (pos) {
      const a = anchorOutside(pts, !atEnd, { x: pos.x, y: pos.y, r: pos.x + pos.w, b: pos.y + entH })
      x = a.x
      y = a.y
      horizontal = a.horizontal
    } else {
      const i0 = atEnd ? pts.length - 1 : 0
      const i1 = atEnd ? pts.length - 2 : 1
      const p0 = pts[i0]
      const p1 = pts[i1]
      const ddx = p1[0] - p0[0]
      const ddy = p1[1] - p0[1]
      const len = Math.hypot(ddx, ddy) || 1
      const dist = Math.min(30, len * 0.45)
      x = p0[0] + (ddx / len) * dist
      y = p0[1] + (ddy / len) * dist
      horizontal = Math.abs(ddx) >= Math.abs(ddy)
    }
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

  // ====== 3. 汇总绘制数据 ======
  interface RenderRel {
    dia: DNode
    points: number[][]
    diamond: { x: number; y: number }
    srcCard: string
    tgtCard: string
    srcCardAt: { x: number; y: number } | null
    tgtCardAt: { x: number; y: number } | null
  }
  const renderRels: RenderRel[] = []
  for (const rel of relations) {
    const dia = diaById.get(rel.id)
    if (!dia) continue
    const absX = dia.data.x as number | undefined
    const absY = dia.data.y as number | undefined
    const hasAbs = typeof absX === 'number' && typeof absY === 'number'
    const manualLine = manual.get(rel.id)

    if (manualLine) {
      const n = manualLine.length
      const diamond = hasAbs
        ? { x: absX!, y: absY! }
        : { x: (manualLine[0][0] + manualLine[n - 1][0]) / 2, y: (manualLine[0][1] + manualLine[n - 1][1]) / 2 }
      renderRels.push({
        dia, points: manualLine, diamond,
        srcCard: rel.srcCard, tgtCard: rel.tgtCard,
        srcCardAt: manualCardAt(manualLine, false, rel.srcId),
        tgtCardAt: manualCardAt(manualLine, true, rel.tgtId),
      })
      continue
    }

    const rd = routedById.get(rel.id)
    if (!rd) continue
    renderRels.push({
      dia, points: rd.points,
      diamond: hasAbs ? { x: absX!, y: absY! } : rd.diamond,
      srcCard: rel.srcCard, tgtCard: rel.tgtCard,
      srcCardAt: rd.srcCardAt, tgtCardAt: rd.tgtCardAt,
    })
  }

  // ====== 4. 图层容器与整体边界 ======
  let svgGroups = ''
  let svgLines = ''
  let svgDiamonds = ''
  let svgLabels = ''
  let svgEntities = ''
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  // ====== 虚线分组框（最底层） ======
  const groupMembers = new Map<string, string[]>()
  entities.forEach((ent) => {
    const g = ent.data.group
    if (!g) return
    const list = groupMembers.get(g) || []
    list.push(ent.id)
    groupMembers.set(g, list)
  })
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
    svgGroups += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="6,4"/>`
    svgGroups += `<text x="${gx + 10}" y="${gy + 18}" font-family="'SimHei', sans-serif" font-size="12" fill="#333">${esc(label)}</text>`
    acc(gx, gy, gw, gh)
  })

  const cardStyle = 'stroke-linejoin="round" stroke-linecap="round" stroke-width="4" stroke="#fff" paint-order="stroke fill" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000"'

  // ====== 4. 连线与基数（底层） ======
  renderRels.forEach((r) => {
    svgLines += `<path d="${r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')}" stroke="#000" stroke-width="1.5" fill="none" stroke-linecap="square"/>`
    r.points.forEach((p) => acc(p[0], p[1]))
    if (r.srcCard && r.srcCardAt) {
      svgLabels += `<text x="${r.srcCardAt.x}" y="${r.srcCardAt.y}" dominant-baseline="middle" ${cardStyle}>${esc(r.srcCard)}</text>`
    }
    if (r.tgtCard && r.tgtCardAt) {
      svgLabels += `<text x="${r.tgtCardAt.x}" y="${r.tgtCardAt.y}" dominant-baseline="middle" ${cardStyle}>${esc(r.tgtCard)}</text>`
    }
  })

  // ====== 5. 菱形（覆盖在连线之上） ======
  renderRels.forEach(({ dia, diamond }) => {
    const cx = diamond.x
    const cy = diamond.y
    svgDiamonds += `<polygon points="${cx},${cy - diaR} ${cx + diaHalf},${cy} ${cx},${cy + diaR} ${cx - diaHalf},${cy}" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/>`
    svgDiamonds += `<text x="${cx}" y="${cy}" dominant-baseline="middle" font-family="'SimHei', 'Heiti SC', sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(dia.data))}</text>`
    acc(cx - diaHalf, cy - diaR, diaHalf * 2, diaR * 2)
  })

  // ====== 6. 实体（最上层） ======
  entities.forEach((ent) => {
    const pos = entityPos.get(ent.id)
    if (!pos) return

    const fs = (ent.data.fontSize as number) || ER_ENTITY_FONT
    const ff = esc(fontFamily(ent.data))
    // 直角矩形（无圆角）
    svgEntities += `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${entH}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svgEntities += `<text x="${pos.cx}" y="${pos.cy + fs * 0.35}" font-family="'SimHei', '${ff}', sans-serif" font-size="${fs}" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(ent.data))}</text>`

    acc(pos.x, pos.y, pos.w, entH)
  })

  // 图层顺序：分组框 → 连线 → 菱形 → 基数文字 → 实体
  const allSvg = svgGroups + svgLines + svgDiamonds + svgLabels + svgEntities
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 400; maxY = 300 }
  const pad = 40
  return wrapSvg(allSvg, minX - pad, minY - pad, Math.max(1, maxX - minX) + pad * 2, Math.max(1, maxY - minY) + pad * 2)
}

// ====== ER 图：多表示法 ======

/** 折线 → path 的 d 属性 */
function erPathD(pts: number[][]): string {
  return `M ${pts.map((p) => p.join(' ')).join(' L ')}`
}

/** 折线中点（按弧长一半），用于放联系名 */
function midOfPolyline(pts: number[][]): number[] {
  return pointAlong(pts, 0.5)
}

/**
 * 折线上按弧长比例取点（frac ∈ [0,1]），用于给"联系名"找备选落点。
 *
 * 场景：联系名默认放折线中点，而折线中段常常正压在某张表格上（实测「担任」压住
 * emp_id/emp_name 两行文字）。折线两端一定在表外，所以把 25%/40%/60%/75% 也交给
 * 放置器当备选锚点，它才能把标签挪出表格。
 */
function pointAlong(pts: number[][], frac: number): number[] {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  const target = total * frac
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
    }
    acc += d
  }
  return pts[pts.length - 1]
}

/** 文字估算宽度（12px 正文口径） */
function measureText(s: string, fs = 12): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? fs : fs * 0.6
  return w
}

/**
 * 联系名的备选锚点：折线上 25%/40%/60%/75% 处。
 * 中点常常正落在表格/实体内部（联系名会压住里面的文字），而折线两端一定在外侧，
 * 把它们交给 makeLabelPlacer 当锚点，标签才有地方可挪。
 */
function labelAltPoints(pts: number[][]): [number, number][] {
  if (pts.length < 2) return []
  const out: [number, number][] = []
  for (const f of [0.12, 0.25, 0.4, 0.6, 0.75, 0.88]) {
    const p = pointAlong(pts, f)
    out.push([p[0], p[1] - 10])
  }
  return out
}

/** 带白色描边的文字（压在线/框上也读得清） */
function erText(x: number, y: number, text: string, size = 13, anchor = 'middle', halo = true): string {
  const haloAttr = halo ? ' stroke="#fff" stroke-width="4" paint-order="stroke"' : ''
  return `<text x="${Math.round(x)}" y="${Math.round(y)}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="${size}" font-weight="bold" text-anchor="${anchor}" fill="#000"${haloAttr}>${esc(text)}</text>`
}

/** 虚线分组框（模块） */
function erGroupFrames(
  entities: DNode[],
  pos: Map<string, ErPlaced>,
  heightOf: (ent: DNode) => number,
): string {
  const groups = new Map<string, { x: number; y: number; r: number; b: number }>()
  for (const ent of entities) {
    const g = ent.data.group
    if (!g) continue
    const p = pos.get(ent.id)
    if (!p) continue
    const box = { x: p.x, y: p.y, r: p.x + p.w, b: p.y + heightOf(ent) }
    const cur = groups.get(String(g))
    if (!cur) groups.set(String(g), { ...box })
    else {
      cur.x = Math.min(cur.x, box.x)
      cur.y = Math.min(cur.y, box.y)
      cur.r = Math.max(cur.r, box.r)
      cur.b = Math.max(cur.b, box.b)
    }
  }
  let out = ''
  const pad = 26
  for (const [name, g] of groups) {
    const x = g.x - pad
    const y = g.y - pad - 6
    const w = g.r - g.x + pad * 2
    const h = g.b - g.y + pad * 2 + 6
    out += `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="6" fill="none" stroke="#666" stroke-width="1.2" stroke-dasharray="7,5"/>`
    out += `<text x="${Math.round(x + 10)}" y="${Math.round(y + 16)}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="12" fill="#333">${esc(name)}</text>`
  }
  return out
}

/**
 * 浮动标签放置：先试给定点，再沿法向/沿线小幅偏移，尽量不与"已经放好的标签"重叠。
 *
 * 需要的场景：寻线引擎已经把基数标注放好了，而"联系名"是渲染层后放的 ——
 * 两者互不知情就会压在一起（同一条联系的中点、以及同一对实体的多条联系尤其明显）。
 */
function makeLabelPlacer(
  avoidBoxes: { x: number; y: number; w: number; h: number }[] = [],
  anchor: 'middle' | 'alphabetic' = 'alphabetic',
) {
  const placed: { x: number; y: number; w: number; h: number }[] = []
  /**
   * 估算文字的"实际渲染盒"。
   * 基数/联系名都带 4px 白色描边（paint-order: stroke），而 getBBox 会把描边算进去 ——
   * 只按 measureText 估宽会让"看起来已经避开"的标签实际仍有 1~2px 相交
   * （实测「N」压住联系名「发布」148px²）。这里把描边计入，并按锚点方式摆正盒子：
   * middle = dominant-baseline:middle（基数标注）；alphabetic = 常规基线（erText）。
   */
  const boxOf = (x: number, y: number, text: string, size: number) => {
    const w = measureText(text, size) + 4
    const h = size * 1.15 + 4
    const top = anchor === 'middle' ? y - h / 2 : y - size * 0.8 - 2
    return { x: x - w / 2, y: top, w, h }
  }
  /** 两个盒子（各外扩 m/2，等价于旧实现里"留 m 净空"）的重叠面积；0 = 互不干扰 */
  const overlapArea = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
    m: number,
  ) => {
    const ox = Math.min(a.x + a.w + m / 2, b.x + b.w + m / 2) - Math.max(a.x - m / 2, b.x - m / 2)
    const oy = Math.min(a.y + a.h + m / 2, b.y + b.h + m / 2) - Math.max(a.y - m / 2, b.y - m / 2)
    return ox > 0 && oy > 0 ? ox * oy : 0
  }
  const costOf = (a: { x: number; y: number; w: number; h: number }) => {
    let c = 0
    for (const b of placed) c += overlapArea(a, b, 2)
    // 实体框 / 表格行文字代价 ×2：宁可离自己的连线远一点，也不要压住图形里的文字
    for (const b of avoidBoxes) c += overlapArea(a, b, 4) * 2
    return c
  }
  return {
    /** 预占位（寻线引擎放好的基数标注） */
    reserve(x: number, y: number, text: string, size: number) {
      placed.push(boxOf(x, y, text, size))
    },
    /**
     * 放置一个浮动标签。
     * @param alts 备选锚点（例如折线上 25%/75% 处的点）—— 主锚点周围全被占满时用它们。
     * 所有候选都冲突时**不再退回主锚点**（那正是"联系名压住表格行文字"的来源），
     * 而是取重叠面积最小的那个候选。
     */
    place(x: number, y: number, text: string, size: number, alts: [number, number][] = []): { x: number; y: number } {
      const w = measureText(text, size)
      // 阶梯要"够长"：寻线引擎在候选全被挡住时会兜底把标注放回原处（默认示例实测有基数
      // 标注落在表框内部、离最近空位 >60px），旧阶梯最多只能挪 64px，于是两个标签一起
      // 卡在表里互相压住（「N」压「发布」148px²）。这里把纵向扩到 ±128、横向扩到 ±(w+100)。
      const ladder: [number, number][] = [
        [0, 0], [0, -16], [0, 16], [0, -30], [0, 30], [0, -46], [0, 46], [0, -64], [0, 64],
        [0, -96], [0, 96], [0, -128], [0, 128],
        [-w / 2 - 10, 0], [w / 2 + 10, 0],
        [-w / 2 - 10, -16], [w / 2 + 10, -16], [-w / 2 - 10, 16], [w / 2 + 10, 16],
        [-w / 2 - 24, -30], [w / 2 + 24, -30], [-w / 2 - 24, 30], [w / 2 + 24, 30],
        [-w / 2 - 40, -46], [w / 2 + 40, -46], [-w / 2 - 40, 46], [w / 2 + 40, 46],
        [-w / 2 - 56, -64], [w / 2 + 56, -64], [-w / 2 - 56, 64], [w / 2 + 56, 64],
        [-w / 2 - 72, -96], [w / 2 + 72, -96], [-w / 2 - 72, 96], [w / 2 + 72, 96],
        [-w / 2 - 100, -128], [w / 2 + 100, -128], [-w / 2 - 100, 128], [w / 2 + 100, 128],
      ]
      const anchors: [number, number][] = [[x, y], ...alts]
      let best: { x: number; y: number; box: { x: number; y: number; w: number; h: number } } | null = null
      let bestCost = Infinity
      for (const [ax, ay] of anchors) {
        for (const [dx, dy] of ladder) {
          const cand = boxOf(ax + dx, ay + dy, text, size)
          const c = costOf(cand)
          if (c === 0) {
            placed.push(cand)
            return { x: ax + dx, y: ay + dy }
          }
          if (c < bestCost) {
            bestCost = c
            best = { x: ax + dx, y: ay + dy, box: cand }
          }
        }
      }
      placed.push(best!.box)
      return { x: best!.x, y: best!.y }
    },
  }
}

/** 共用准备：实体定位 + 联系解析 + 正交寻线 */
function prepareEr(
  nodes: DNode[],
  edges: Edge[],
  heightOf: (ent: DNode) => number = () => 44,
) {
  const entities = nodes.filter((n) => n.type === 'erEntity')
  const diamonds = nodes.filter((n) => n.type === 'erDiamond')
  const entWOf = (ent: DNode) =>
    estimateEntityWidth(String(ent.data.label || ''), (ent.data.fontSize as number) || ER_ENTITY_FONT)
  const pos = placeErEntities(entities, entWOf, heightOf)
  const { relations } = collectERRelations(
    diamonds.map((d) => ({ id: d.id, label: String(d.data.label || '') })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> | undefined })),
  )
  const routed = routeRelations(
    entities.map((ent) => {
      const p = pos.get(ent.id)
      return { id: ent.id, x: p ? p.x : 0, y: p ? p.y : 0, w: p ? p.w : 120, h: heightOf(ent) }
    }),
    relations,
  )
  return { entities, diamonds, pos, relations, routed, entWOf }
}

/** 实体框（直角） */
function erEntityBox(p: ErPlaced, label: string, h: number): string {
  return (
    `<rect x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${p.w}" height="${h}" fill="#fff" stroke="#000" stroke-width="1.5"/>` +
    `<text x="${Math.round(p.cx)}" y="${Math.round(p.y + h / 2 + 5)}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="${ER_ENTITY_FONT}" font-weight="bold" text-anchor="middle" fill="#000">${esc(label)}</text>`
  )
}

/** 表示法二：只有实体连接 —— 不画菱形，实体之间直接连线，两端标基数，线中段标联系名 */
function erSvgDirect(nodes: DNode[], edges: Edge[]): string {
  const { entities, pos, relations, routed } = prepareEr(nodes, edges)
  const entH = 44

  const placer = makeLabelPlacer(
    entities.map((ent) => {
      const p = pos.get(ent.id)!
      return { x: p.x, y: p.y, w: p.w, h: entH }
    }),
  )
  // 先占住寻线引擎放好的基数标注，再放联系名，避免两者叠在一起
  for (const rd of routed) {
    const rel = relations.find((r) => r.id === rd.id)
    if (rel?.srcCard && rd.srcCardAt) placer.reserve(rd.srcCardAt.x, rd.srcCardAt.y, rel.srcCard, 13)
    if (rel?.tgtCard && rd.tgtCardAt) placer.reserve(rd.tgtCardAt.x, rd.tgtCardAt.y, rel.tgtCard, 13)
  }

  let paths = ''
  let labels = ''
  for (const rd of routed) {
    const rel = relations.find((r) => r.id === rd.id)
    paths += `<path d="${erPathD(rd.points)}" fill="none" stroke="#000" stroke-width="1.5"/>`
    if (rel?.srcCard && rd.srcCardAt) labels += erText(rd.srcCardAt.x, rd.srcCardAt.y, rel.srcCard, 13)
    if (rel?.tgtCard && rd.tgtCardAt) labels += erText(rd.tgtCardAt.x, rd.tgtCardAt.y, rel.tgtCard, 13)
    if (rel?.label) {
      const mid = midOfPolyline(rd.points)
      const at = placer.place(mid[0], mid[1] - 10, rel.label, 12, labelAltPoints(rd.points))
      labels += erText(at.x, at.y, rel.label, 12)
    }
  }

  const frames = erGroupFrames(entities, pos, () => entH)
  let boxes = ''
  for (const ent of entities) {
    const p = pos.get(ent.id)
    if (!p) continue
    boxes += erEntityBox(p, String(ent.data.label || ''), entH)
  }

  const bb = bounds([
    ...Array.from(pos.values()).map((p) => ({ x: p.x, y: p.y, w: p.w, h: entH })),
    ...routed.flatMap((rd) => rd.points.map((pt) => ({ x: pt[0], y: pt[1], w: 0, h: 0 }))),
  ])
  const pad = 40
  return wrapSvg(frames + paths + labels + boxes, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

/**
 * 表示法三：实体 + 字段环绕（教材式 E-R 图）。
 *
 * 与陈氏表示法共用同一套骨架：实体矩形 + 联系菱形 + 两端 m/n 基数 + 正交寻线；
 * 额外把每个实体的字段画成环绕它的椭圆、各连一条直线到实体 —— 即教材里
 * 「实体属性图 + 联系」的完整 E-R 图（例：图书借阅管理系统那张）。
 *
 * 字段摆位是本表示法的关键，也是"连线不压字段"的来源：
 *   1. 环的尺寸只取决于字段数与字段宽度，与连线无关（否则"环大小 ↔ 连线方向"循环依赖）。
 *      用圆环而非椭圆：椭圆在长轴两端的弧长曲率半径只有 b²/a，同样宽的字段摆在左右两端
 *      要占掉大得多的角度，实测会把 4 个字段摊到 236° 上，完全不成"一簇"。
 *   2. 由"当前寻线结果"推出该实体连线出去的方向，把这些方向标记为"已占用"。
 *   3. 字段只摆在未占用的扇区里，沿圆弧以固定小步长推进角度直到相邻椭圆刚好不重叠 ——
 *      于是同一扇区里的字段是"贴着排"的（教材那种扇形），而不是稀疏地绕一整圈。
 *   4. **定点迭代**：字段摆位 ↔ 连线方向互相影响（字段挪了，连通线会绕路，绕路又改变
 *      出口方向）。所以先寻一遍线得到方向、摆一次字段，再把字段扇区作为障碍重寻，
 *      用新方向重摆，如此迭代到方向不再变化（最多 3 轮）。
 *      最后呈现的连线是"绕开了所呈现的字段扇区"的那一版，两者自洽。
 */
function erSvgAttribute(nodes: DNode[], edges: Edge[]): string {
  const entities = nodes.filter((n) => n.type === 'erEntity')
  const diamonds = nodes.filter((n) => n.type === 'erDiamond')
  const fieldsOf = (ent: DNode) => ((ent.data.fields as ERField[] | undefined) || [])
  const labelOf = (f: ERField) => (f.type ? `${f.name}: ${f.type}` : f.name)
  const rxOf = (text: string) => Math.max(34, Math.round(measureText(text, 12) / 2) + 11)
  const RY = 17
  const ENT_H = 40
  const entWOf = (ent: DNode) =>
    Math.max(90, Math.round(measureText(String(ent.data.label || ''), ER_ENTITY_FONT)) + 30)
  const diaR = 16
  const diaHalf = 28

  // ── 1) 实体定位（四种表示法共用） ──
  const pos = placeErEntities(entities, entWOf, () => ENT_H)

  /**
   * 环的半径 = 三者取最大：
   *   · 容下实体框（半对角线 + 余量）与最长的字段椭圆（否则椭圆会压在实体框上）；
   *   · 按"整圈可用弧长"容纳全部字段的保守估计（可用弧只按 80% 算 —— 剩下 20% 留给连线出口）。
   *
   * **不再设硬顶**（原来是 RING_MAX = 240）：字段多/字段长时半径随需求增大。
   * 硬顶 + "兜底全塞进第一个扇区"正是 42 字段表 82 组椭圆相交（最深 9641px²）的根因；
   * 半径变大只是画布变大（容器可横向滚动、字号不变），不会再让椭圆互相重叠。
   */
  const RING_USABLE_ARC = Math.PI * 2 * 0.8
  /** 相邻字段椭圆包围盒之间要留的净空（吸收坐标取整带来的 ±0.5px 误差） */
  const ELLIPSE_GAP = 2
  const baseRing = (ent: DNode) => {
    const fs = fieldsOf(ent)
    if (!fs.length) return { a: 0, rxMax: 0 }
    const rx = fs.map((f) => rxOf(labelOf(f)))
    let rxMax = 0
    for (const v of rx) rxMax = Math.max(rxMax, v)
    let needSum = 0
    for (let i = 1; i < rx.length; i++) needSum += rx[i] + rx[i - 1] + ELLIPSE_GAP
    const half = Math.hypot(entWOf(ent) / 2, ENT_H / 2)
    const aBase = Math.max(Math.round(half) + 56, 84 + 11 * fs.length, rxMax + 12)
    const aFit = needSum > 0 ? Math.ceil(needSum / RING_USABLE_ARC) : 0
    return { a: Math.max(aBase, aFit), rxMax }
  }

  // ── 2) 把"实体 + 字段环"当作一个单元做分离，避免环与环相撞 ──
  // 绝对坐标与网格坐标都可能太挤：默认 ER 数据的行距只有 130~160px，而环的直径动辄 300px+。
  const unitOf = new Map<string, { hw: number; hh: number }>()
  entities.forEach((ent) => {
    const { a, rxMax } = baseRing(ent)
    unitOf.set(ent.id, {
      hw: Math.max(entWOf(ent) / 2, a + rxMax),
      hh: Math.max(ENT_H / 2, a + RY),
    })
  })
  {
    const SEP = 24
    for (let it = 0; it < 80; it++) {
      let moved = false
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const A = pos.get(entities[i].id)
          const B = pos.get(entities[j].id)
          if (!A || !B) continue
          const ua = unitOf.get(entities[i].id)!
          const ub = unitOf.get(entities[j].id)!
          const dx = B.cx - A.cx
          const dy = B.cy - A.cy
          const ox = ua.hw + ub.hw + SEP - Math.abs(dx)
          const oy = ua.hh + ub.hh + SEP - Math.abs(dy)
          if (ox <= 0 || oy <= 0) continue
          moved = true
          // 沿"重叠更小"的那个轴分开，位移在两者间均摊
          if (ox < oy) {
            const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5)
            A.x -= s; A.cx -= s; B.x += s; B.cx += s
          } else {
            const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5)
            A.y -= s; A.cy -= s; B.y += s; B.cy += s
          }
        }
      }
      if (!moved) break
    }
  }

  const boxesOf = () =>
    entities.map((ent) => {
      const p = pos.get(ent.id)!
      return { id: ent.id, x: p.x, y: p.y, w: p.w, h: ENT_H }
    })

  // ── 3) 联系解析 ──
  const { relations } = collectERRelations(
    diamonds.map((d) => ({ id: d.id, label: String(d.data.label || '') })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> | undefined })),
  )

  interface AttrSpot { f: ERField; x: number; y: number; rx: number }
  type Obstacle = { id: string; owner: string; x: number; y: number; w: number; h: number }
  type Routed = ReturnType<typeof routeRelations>

  /**
   * 由一次寻线结果推出"每个实体在环带附近被连线占用了哪些方向"。
   *
   * 只看"第一个航点"是不够的：连线出去之后还会拐弯，后面那几段照样会扫过环带上的
   * 字段椭圆（实测正是由此产生 26 个"连线压椭圆"的采样点）。这里改为**沿折线密集采样**，
   * 只收"半径落在环带 [a-RY-14, a+RY+14] 之间"的采样点 —— 正好是字段椭圆所在的那一圈，
   * 于是被占用的方向是"连线真正经过的角度"，与字段摆位严丝合缝。
   */
  const exitsFrom = (routed: Routed) => {
    const exits = new Map<string, number[]>()
    const push = (id: string, ang: number) => {
      const list = exits.get(id)
      if (list) list.push(ang)
      else exits.set(id, [ang])
    }
    for (const rd of routed) {
      if (rd.points.length < 2) continue
      const rel = relations.find((r) => r.id === rd.id)
      if (!rel) continue
      for (const entId of [rel.srcId, rel.tgtId]) {
        const p = pos.get(entId)
        const ent = entities.find((e) => e.id === entId)
        if (!p || !ent) continue
        const { a } = baseRing(ent)
        const outer = a + RY + 14
        const inner = Math.max(Math.hypot(p.w / 2, ENT_H / 2) + 6, a - RY - 14)
        for (let i = 0; i + 1 < rd.points.length; i++) {
          const [x1, y1] = rd.points[i]
          const [x2, y2] = rd.points[i + 1]
          const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12))
          for (let k = 0; k <= n; k++) {
            const x = x1 + ((x2 - x1) * k) / n
            const y = y1 + ((y2 - y1) * k) / n
            const d = Math.hypot(x - p.cx, y - p.cy)
            if (d >= inner && d <= outer) push(entId, Math.atan2(y - p.cy, x - p.cx))
          }
        }
      }
    }
    return exits
  }

  /** 该实体"没有连线出去"的方向区间（按宽度降序） */
  const freeSectorsOf = (list: number[]): [number, number][] => {
    if (!list.length) return []
    const PAD_ANG = 0.42
    const TAU = Math.PI * 2
    const blocks: [number, number][] = []
    for (const a of list) {
      let s = a - PAD_ANG
      let e = a + PAD_ANG
      while (s < 0) { s += TAU; e += TAU }
      while (s >= TAU) { s -= TAU; e -= TAU }
      blocks.push([s, e])
    }
    blocks.sort((x, y) => x[0] - y[0])
    const merged: [number, number][] = []
    for (const b of blocks) {
      const last = merged[merged.length - 1]
      if (last && b[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], b[1])
      else merged.push([b[0], b[1]])
    }
    // 跨 0 的首尾合并
    if (merged.length > 1 && merged[0][0] <= 1e-9 && merged[merged.length - 1][1] >= TAU - 1e-9) {
      merged[merged.length - 1][1] = merged[0][1] + TAU
      merged.shift()
    }
    const free: [number, number][] = []
    for (let i = 0; i < merged.length; i++) {
      const s = merged[i][1]
      const e = i + 1 < merged.length ? merged[i + 1][0] : merged[0][0] + TAU
      if (e - s > 1e-6) free.push([s, e])
    }
    return free.sort((x, y) => y[1] - y[0] - (x[1] - x[0]))
  }

  /** 按"当前寻线结果"摆字段，并给出字段扇区的外接框（作为下一轮寻线的障碍） */
  const placeFans = (routed: Routed) => {
    const exits = exitsFrom(routed)
    const attrOf = new Map<string, AttrSpot[]>()

    /**
     * 候选角度：空闲扇区优先（宽度降序、从扇区中心向两侧交替推进 —— 保持"字段贴着排成一簇"
     * 的教材外观），全部扇区扫完后**兜底再扫整圈**。
     *
     * 兜底扫整圈是必需的一道安全网：只要圆环上还有位置就一定能找到，绝不会像旧实现那样
     * 把剩余字段无脑塞进第一个扇区（42 字段时 82 组椭圆相交的直接原因）。
     */
    const candidateAngles = (sectors: [number, number][]): number[] => {
      const STEP = 0.006
      const TAU = Math.PI * 2
      const out: number[] = []
      for (const [s0, s1] of sectors) {
        const mid = (s0 + s1) / 2
        const half = (s1 - s0) / 2 - 0.02
        for (let k = 0; k * STEP <= half; k++) {
          out.push(mid + k * STEP)
          if (k) out.push(mid - k * STEP)
        }
      }
      for (let k = 0; k * STEP < TAU; k++) out.push(-Math.PI / 2 + k * STEP)
      return out
    }

    /**
     * 该位置放一个字段椭圆，是否会被某条联系折线穿过。
     *
     * 前面已经用"环带占用角度"避开了连线，但那条路只保证**本实体的**连线不占用
     * 扇区方向 —— 别的实体的连线仍可能从这片扇区穿过去（实测残留 1 个椭圆被穿）。
     * 所以这里直接拿最终折线做一次精确检查。
     */
    const lineHits = (cx: number, cy: number, rx2: number) => {
      let n = 0
      for (const rd of routed) {
        for (let i = 0; i + 1 < rd.points.length; i++) {
          const x1 = rd.points[i][0]
          const y1 = rd.points[i][1]
          const x2 = rd.points[i + 1][0]
          const y2 = rd.points[i + 1][1]
          const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 8))
          for (let k = 0; k <= steps; k++) {
            const x = x1 + ((x2 - x1) * k) / steps
            const y = y1 + ((y2 - y1) * k) / steps
            const nx = (x - cx) / (rx2 + 2)
            const ny = (y - cy) / (RY + 2)
            if (nx * nx + ny * ny < 1) n++
          }
        }
      }
      return n
    }

    entities.forEach((ent) => {
      const fs = fieldsOf(ent)
      if (!fs.length) return
      const p = pos.get(ent.id)!
      const { a } = baseRing(ent)
      const rx = fs.map((f) => rxOf(labelOf(f)))

      // 候选角度：无连线时沿用"整圈从正上方起均分"（与实体属性图一致）打头，
      // 再跟上空闲扇区（贴着排）与整圈兜底。
      const exitList = exits.get(ent.id) || []
      const sectors = freeSectorsOf(exitList)
      const cands: number[] = []
      if (!exitList.length) {
        for (let i = 0; i < fs.length; i++) cands.push(-Math.PI / 2 + (Math.PI * 2 * i) / fs.length)
      }
      cands.push(...candidateAngles(sectors))

      const spots: AttrSpot[] = []
      /** 与已放置字段椭圆的包围盒是否相交（与验收口径一致），并留 ELLIPSE_GAP 净空吸收取整误差 */
      const hitsSpot = (x: number, y: number, r: number) =>
        spots.some(
          (s) =>
            Math.abs(x - s.x) < r + s.rx + ELLIPSE_GAP &&
            Math.abs(y - s.y) < RY * 2 + ELLIPSE_GAP,
        )

      // 逐个字段放置：取"第一个与已放置椭圆都不相交"的候选角度；同一次里再用 lineHits
      // 挑"没被连线穿过"的那个（上限 10 个候选，避免逐点检查拖慢渲染）。
      // 半径 a 按 needSum ≤ 0.8·2πa 选取，整圈必然放得下；万一扇区被连线切得太碎，
      // 逐级外扩半径重扫 —— 半径越大角度需求越小，一定能放下，绝不重叠。
      fs.forEach((f, i) => {
        let best: { x: number; y: number; hits: number } | null = null
        let radius = a
        for (let round = 0; round < 24 && !best; round++) {
          let examined = 0
          for (const t of cands) {
            const x = p.cx + radius * Math.cos(t)
            const y = p.cy + radius * Math.sin(t)
            if (hitsSpot(x, y, rx[i])) continue
            const hits = lineHits(x, y, rx[i])
            if (!best || hits < best.hits) best = { x, y, hits }
            if (best.hits === 0 || ++examined >= 10) break
          }
          if (!best) radius += Math.max(40, RY * 3)
        }
        if (!best) {
          // 理论不可达（整圈可用时半径 a 就能放下全部字段）；保底仍取不同角度，不留重叠。
          const t = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(1, fs.length)
          best = { x: p.cx + radius * Math.cos(t), y: p.cy + radius * Math.sin(t), hits: 0 }
        }
        spots.push({ f, x: best.x, y: best.y, rx: rx[i] })
      })
      attrOf.set(ent.id, spots)
    })

    const obstacles: Obstacle[] = []
    entities.forEach((ent) => {
      const spots = attrOf.get(ent.id)
      if (!spots || !spots.length) return
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const s of spots) {
        x0 = Math.min(x0, s.x - s.rx)
        x1 = Math.max(x1, s.x + s.rx)
        y0 = Math.min(y0, s.y - RY)
        y1 = Math.max(y1, s.y + RY)
      }
      obstacles.push({ id: `attr_${ent.id}`, owner: ent.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
    })

    const angles: number[] = []
    attrOf.forEach((spots, id) => {
      for (const s of spots) angles.push(Math.round(Math.atan2(s.y - pos.get(id)!.cy, s.x - pos.get(id)!.cx) * 1000))
    })
    return { attrOf, obstacles, angles }
  }

  // ── 4) 定点迭代：字段摆位 ↔ 连线方向 ──
  // 字段挪了 → 连线绕路 → 绕路又改变"环带被占用的方向" → 字段再挪。
  // 迭代到方向不再变化（最多 5 轮），最后**再做一次寻线** ——
  // 这一步很关键：迭代中途的每一轮，寻线用的都是"上一轮"的字段障碍，
  // 于是最后呈现的连线可能并没有绕开最后呈现的字段（实测残留 26 个"连线压椭圆"采样点）。
  const pathKey = (rs: Routed) => rs.map((r) => r.points.map((q) => q.join(',')).join(';')).join('|')
  // 与表格型对齐：出口锚点沿边错开、跨实体对连线互相分道。
  // 否则多条联系的基数标注会落在同一个像素上（默认示例实测 4 个「1」重叠、7 组同坐标）。
  const routeOpts = { spreadAnchors: true, separateOverlaps: true }
  let routed = routeRelations(boxesOf(), relations, routeOpts)
  let fans = placeFans(routed)
  for (let it = 0; it < 6; it++) {
    const next = routeRelations(boxesOf(), relations, { ...routeOpts, extraObstacles: fans.obstacles })
    const stable = pathKey(next) === pathKey(routed)
    routed = next
    // 关键：字段摆位永远针对"当前这一版连线"来算 —— 这样"呈现的字段"一定不与
    // "呈现的连线"相交（局部修复才真正有效）；而这一版连线又是绕开上一版字段的，
    // 收敛后两者等价，两个方向的性质就同时成立了。
    fans = placeFans(routed)
    if (stable) break
  }
  const attrOf = fans.attrOf
  const routedById = new Map(routed.map((r) => [r.id, r]))
  const diaById = new Map(diamonds.map((d) => [d.id.replace(/^(dia_)+/, ''), d]))

  // ── 5) 绘制 ──
  let svgGroups = ''
  let svgAttrLines = ''
  let svgAttrShapes = ''
  let svgLines = ''
  let svgDiamonds = ''
  let svgLabels = ''
  let svgEntities = ''
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  // 分组虚线框：范围取"实体 + 字段环"的包围盒，虚线不会横切字段
  const groupMembers = new Map<string, string[]>()
  entities.forEach((ent) => {
    const g = ent.data.group
    if (!g) return
    const list = groupMembers.get(g) || []
    list.push(ent.id)
    groupMembers.set(g, list)
  })
  groupMembers.forEach((ids, label) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const id of ids) {
      const q = pos.get(id)
      if (!q) continue
      const u = unitOf.get(id)!
      x0 = Math.min(x0, q.cx - u.hw)
      x1 = Math.max(x1, q.cx + u.hw)
      y0 = Math.min(y0, q.cy - u.hh)
      y1 = Math.max(y1, q.cy + u.hh)
    }
    if (x0 === Infinity) return
    const pad = 24
    const header = 26
    const gx = x0 - pad
    const gy = y0 - pad - header
    const gw = Math.max(x1 - x0 + pad * 2, Math.round(textWidth(label, 12)) + 40)
    const gh = y1 - y0 + pad * 2 + header
    svgGroups += `<rect x="${Math.round(gx)}" y="${Math.round(gy)}" width="${Math.round(gw)}" height="${Math.round(gh)}" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="6,4"/>`
    svgGroups += `<text x="${Math.round(gx + 10)}" y="${Math.round(gy + 18)}" font-family="'SimHei', sans-serif" font-size="12" fill="#333">${esc(label)}</text>`
    acc(gx, gy, gw, gh)
  })

  // 字段：连线自实体中心引出（之后被实体框盖住），椭圆承载文字
  entities.forEach((ent) => {
    const spots = attrOf.get(ent.id)
    if (!spots) return
    const p = pos.get(ent.id)!
    for (const s of spots) {
      svgAttrLines += `<line x1="${Math.round(p.cx)}" y1="${Math.round(p.cy)}" x2="${Math.round(s.x)}" y2="${Math.round(s.y)}" stroke="#000" stroke-width="1.2"/>`
    }
    for (const s of spots) {
      const dash = s.f.fk ? ' stroke-dasharray="5,3"' : ''
      const underline = s.f.pk ? ' text-decoration="underline"' : ''
      svgAttrShapes += `<ellipse cx="${Math.round(s.x)}" cy="${Math.round(s.y)}" rx="${s.rx}" ry="${RY}" fill="#fff" stroke="#000" stroke-width="1.2"${dash}/>`
      svgAttrShapes += `<text x="${Math.round(s.x)}" y="${Math.round(s.y + 4)}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="12" text-anchor="middle" fill="#000"${underline}>${esc(labelOf(s.f))}</text>`
      acc(s.x - s.rx, s.y - RY, s.rx * 2, RY * 2)
    }
  })

  const cardStyle =
    'stroke-linejoin="round" stroke-linecap="round" stroke-width="4" stroke="#fff" paint-order="stroke fill" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000"'

  /**
   * 基数标注放置器：寻线引擎只保证标注之间不重叠，不知道实体名文字与联系菱形的位置，
   * 于是标注会压住实体名（实测「N」「1」压住「会议记录表」「员工主表（yuangong）」）。
   * 这里把实体框、实体名、联系名一起登记为障碍，标注只在必要时做小幅平移。
   */
  const cardPlacer = makeLabelPlacer(
    entities.map((ent) => {
      const q = pos.get(ent.id)!
      return { x: q.x, y: q.y, w: q.w, h: ENT_H }
    }),
    'middle',
  )
  entities.forEach((ent) => {
    const q = pos.get(ent.id)!
    cardPlacer.reserve(q.cx, q.cy + 5, String(ent.data.label || ''), ER_ENTITY_FONT)
  })
  for (const rel of relations) {
    const rd = routedById.get(rel.id)
    const dia = diaById.get(rel.id)
    if (!rd || !dia) continue
    cardPlacer.reserve(rd.diamond.x, rd.diamond.y, safeLabel(dia.data), 13)
  }

  // 联系连线 + 两端基数
  for (const rel of relations) {
    const rd = routedById.get(rel.id)
    if (!rd) continue
    svgLines += `<path d="${erPathD(rd.points)}" stroke="#000" stroke-width="1.5" fill="none" stroke-linecap="square"/>`
    for (const pt of rd.points) acc(pt[0], pt[1])
    if (rel.srcCard && rd.srcCardAt) {
      const at = cardPlacer.place(rd.srcCardAt.x, rd.srcCardAt.y, rel.srcCard, 14)
      svgLabels += `<text x="${at.x}" y="${at.y}" dominant-baseline="middle" ${cardStyle}>${esc(rel.srcCard)}</text>`
    }
    if (rel.tgtCard && rd.tgtCardAt) {
      const at = cardPlacer.place(rd.tgtCardAt.x, rd.tgtCardAt.y, rel.tgtCard, 14)
      svgLabels += `<text x="${at.x}" y="${at.y}" dominant-baseline="middle" ${cardStyle}>${esc(rel.tgtCard)}</text>`
    }
  }

  // 菱形（联系）
  for (const rel of relations) {
    const rd = routedById.get(rel.id)
    const dia = diaById.get(rel.id)
    if (!rd || !dia) continue
    const cx = rd.diamond.x
    const cy = rd.diamond.y
    svgDiamonds += `<polygon points="${cx},${cy - diaR} ${cx + diaHalf},${cy} ${cx},${cy + diaR} ${cx - diaHalf},${cy}" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/>`
    svgDiamonds += `<text x="${cx}" y="${cy}" dominant-baseline="middle" font-family="'SimHei', 'Heiti SC', sans-serif" font-size="13" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(dia.data))}</text>`
    acc(cx - diaHalf, cy - diaR, diaHalf * 2, diaR * 2)
  }

  // 实体（最上层）
  entities.forEach((ent) => {
    const q = pos.get(ent.id)
    if (!q) return
    svgEntities += `<rect x="${Math.round(q.x)}" y="${Math.round(q.y)}" width="${q.w}" height="${ENT_H}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svgEntities += `<text x="${Math.round(q.cx)}" y="${Math.round(q.cy + 5)}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="${ER_ENTITY_FONT}" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(ent.data))}</text>`
    acc(q.x, q.y, q.w, ENT_H)
  })

  // 图层：分组框 → 字段连线 → 联系连线 → 字段椭圆/文字 → 菱形 → 基数 → 实体
  const allSvg = svgGroups + svgAttrLines + svgLines + svgAttrShapes + svgDiamonds + svgLabels + svgEntities
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 400; maxY = 300 }
  const pad = 40
  return wrapSvg(
    allSvg,
    Math.round(minX - pad),
    Math.round(minY - pad),
    Math.round(Math.max(1, maxX - minX) + pad * 2),
    Math.round(Math.max(1, maxY - minY) + pad * 2),
  )
}

/** 表示法四：表格型（标题行 + 字段行，表与表之间直连） */
function erSvgTable(nodes: DNode[], edges: Edge[]): string {
  const HEAD = 30
  const ROW = 22
  const fieldsOf = (ent: DNode) => ((ent.data.fields as ERField[] | undefined) || [])
  const labelOf = (ent: DNode) => String(ent.data.label || '')
  const rowText = (f: ERField) => `${f.name}${f.type ? ': ' + f.type : ''}${f.pk || f.fk ? '  PK FK' : ''}`

  const widthOf = (ent: DNode) => {
    const rows = fieldsOf(ent).map((f) => measureText(rowText(f), 12))
    const title = measureText(labelOf(ent), 14)
    return Math.max(180, Math.round(Math.max(title + 40, ...rows, 0)) + 28)
  }
  const heightOf = (ent: DNode) => HEAD + fieldsOf(ent).length * ROW + 6

  const entities = nodes.filter((n) => n.type === 'erEntity')
  const diamonds = nodes.filter((n) => n.type === 'erDiamond')

  // ── 正方排布（√n 列）+ 中心向外填位 ──
  // 表格型里枢纽表常常连着大半张图（例：users 参与全部 11 条联系）。若按声明顺序逐行铺开，
  // 枢纽会落在角落、其余表全在它一侧 —— 所有连线从同一个角往外扇，通道被压在同一条带上
  // （实测单通道并发 9 条、共线重叠 5510px）。这里保持"正方外形"不变，
  // 但格子按"到网格中心的距离"认领、实体按从枢纽 BFS 展开的顺序落位：
  // 枢纽居中、邻居围成一圈，连线变短且分散到四个方向。
  const cols = Math.max(1, Math.ceil(Math.sqrt(entities.length)))
  const rows = Math.max(1, Math.ceil(entities.length / cols))

  // 实体邻接表：把菱形当"中继"折叠掉，只留表—表；同时兼容直接 entity↔entity 的边
  const adj = new Map<string, Set<string>>(entities.map((e) => [e.id, new Set<string>()]))
  const diaMembers = new Map<string, string[]>()
  for (const e of edges) {
    const s = String(e.source)
    const t = String(e.target)
    if (adj.has(s) && adj.has(t)) {
      adj.get(s)!.add(t)
      adj.get(t)!.add(s)
      continue
    }
    const dia = adj.has(s) ? t : adj.has(t) ? s : null
    const ent = adj.has(s) ? s : adj.has(t) ? t : null
    if (!dia || !ent) continue
    const list = diaMembers.get(dia)
    if (list) list.push(ent)
    else diaMembers.set(dia, [ent])
  }
  diaMembers.forEach((members) => {
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        adj.get(members[i])!.add(members[j])
        adj.get(members[j])!.add(members[i])
      }
  })

  const degree = (id: string) => adj.get(id)?.size ?? 0
  // 枢纽 = 连接最多的表；BFS 展开得到落位顺序，同层内按度数降序（强连接的更靠近中心）
  const order: string[] = []
  const seen = new Set<string>()
  if (entities.length) {
    let hub = entities[0]
    for (const e of entities) if (degree(e.id) > degree(hub.id)) hub = e
    let frontier = [hub.id]
    seen.add(hub.id)
    order.push(hub.id)
    while (frontier.length) {
      const cand = new Set<string>()
      for (const f of frontier) for (const nx of adj.get(f) || []) if (!seen.has(nx)) cand.add(nx)
      const uniq = [...cand].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b))
      const next: string[] = []
      for (const c of uniq) {
        if (seen.has(c)) continue
        seen.add(c)
        next.push(c)
        order.push(c)
      }
      frontier = next
    }
    // 不连通的孤岛：接在队尾（各自成为新的 BFS 起点）
    for (const e of entities) if (!seen.has(e.id)) { seen.add(e.id); order.push(e.id) }
  }

  // ── 落位：两个候选各跑一遍真实寻线，选代价低的 ──
  //   ring —— 格子用 ER 布局器的"环序"（切比雪夫环 → 同行列优先 → 曼哈顿 → 行,列），
  //           实体按"枢纽优先的 BFS"填进去 = 枢纽居中、邻居围成一圈
  //   decl —— 改动前的实现：格子逐行铺开、实体按声明顺序
  //            （默认 ER 数据的声明顺序恰好已把枢纽放在中间，此时它反而更好）
  // 谁更好不靠猜：几何代理看不出寻线引擎的贪心偏好，只有真跑一遍才准。
  // 把 decl 也放进候选，保证结果不会比改动前更差。
  const ringAssign = new Map<string, { r: number; c: number }>()
  ringOrderedCells(rows, cols).forEach((cell, i) => {
    const id = order[i]
    if (id) ringAssign.set(id, cell)
  })
  const declAssign = new Map<string, { r: number; c: number }>()
  entities.forEach((ent, i) => declAssign.set(ent.id, { r: Math.floor(i / cols), c: i % cols }))

  const { relations } = collectERRelations(
    diamonds.map((d) => ({ id: d.id, label: String(d.data.label || '') })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> | undefined })),
  )
  // 表格型的表框比陈氏实体大得多、且枢纽表往往连着大半张图：
  // 出口锚点沿边错开（不再全部挤在边中点），并让不同来源的连线也互相分道。
  const routeOpts = { spreadAnchors: true, separateOverlaps: true }

  // 列宽取该列最宽的表、行高取该行最高的表，保证表格大小不一时也不互相压住。
  const H_GAP = 100
  const V_GAP = 90

  /**
   * 实体在配置里的绝对坐标（x、y 同时为数字才认）。
   *
   * 表格型此前完全无视 x/y，永远按自己的网格排出 100/415/734/1049 @y=60 —— 用户在
   * 编辑器里排好的位置（AI 布局 / SQL 导入的 layoutErEntities 结果）被丢掉。
   * 规则：**有 x/y 就用 x/y 当表框左上角；缺失才落到网格**；网格位若与已有表框相撞再向下让位。
   */
  const absOf = (ent: DNode): { x: number; y: number } | null => {
    const x = ent.data.x
    const y = ent.data.y
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
  }
  const allAbs = entities.length > 0 && entities.every((ent) => absOf(ent) !== null)

  const layoutOf = (assign: Map<string, { r: number; c: number }>) => {
    const colW = new Array(cols).fill(180)
    const rowH = new Array(rows).fill(120)
    entities.forEach((ent) => {
      const cell = assign.get(ent.id)
      if (!cell || absOf(ent)) return
      colW[cell.c] = Math.max(colW[cell.c], widthOf(ent))
      rowH[cell.r] = Math.max(rowH[cell.r], heightOf(ent))
    })
    const colX: number[] = []
    let accX = 100
    for (let c = 0; c < cols; c++) {
      colX[c] = accX
      accX += colW[c] + H_GAP
    }
    const rowY: number[] = []
    let accY = 60
    for (let r = 0; r < rows; r++) {
      rowY[r] = accY
      accY += rowH[r] + V_GAP
    }
    const placed = new Map<string, ErPlaced>()
    const taken: { x: number; y: number; w: number; h: number }[] = []
    const GAP = 6
    /**
     * 与已落位表框相交时**保持 x 不变、向下让到"相交框底部 + GAP"**（最小让位）。
     * 配置坐标是给陈氏小框（高 40）排的，表格型表高 124~190，直接照搬会互相压住：
     * 默认示例 admin/meeting、salary/todo/message 等 3 组表框相交。让位后 0 相交、0 文字重叠，
     * 且绝大多数表 rect.x/y 仍精确等于配置坐标（单表/无冲突配置 100% 精确）。
     */
    const settleY = (x: number, y0: number, w: number, h: number) => {
      let y = y0
      for (let k = 0; k < 40; k++) {
        const hit = taken.filter(
          (b) => !(x + w + GAP <= b.x || b.x + b.w + GAP <= x || y + h + GAP <= b.y || b.y + b.h + GAP <= y),
        )
        if (!hit.length) break
        y = Math.max(...hit.map((b) => b.y + b.h)) + GAP
      }
      return y
    }
    const put = (ent: DNode, x: number, y: number) => {
      const w = widthOf(ent)
      const h = heightOf(ent)
      placed.set(ent.id, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 })
      taken.push({ x, y, w, h })
    }
    // 1) 有 x/y 的实体：按配置坐标摆放（x 精确保留），只在相撞时向下最小让位
    entities.forEach((ent) => {
      const ab = absOf(ent)
      if (!ab) return
      put(ent, ab.x, settleY(ab.x, ab.y, widthOf(ent), heightOf(ent)))
    })
    // 2) 缺坐标的走网格；同样只在与已落位表框相撞时向下让位
    entities.forEach((ent) => {
      const cell = assign.get(ent.id)
      if (!cell || absOf(ent)) return
      put(ent, colX[cell.c], settleY(colX[cell.c], rowY[cell.r], widthOf(ent), heightOf(ent)))
    })
    return placed
  }
  const boxesOf = (placed: Map<string, ErPlaced>) =>
    entities.map((ent) => {
      const q = placed.get(ent.id)!
      return { id: ent.id, x: q.x, y: q.y, w: q.w, h: q.h }
    })

  let pos = layoutOf(ringAssign)
  // 全部实体都有绝对坐标时，两种网格候选结果完全一样，不必再跑寻线评分
  if (relations.length > 0 && entities.length <= 60 && !allAbs) {
    let bestCost = Infinity
    for (const assign of [ringAssign, declAssign]) {
      const trial = layoutOf(assign)
      const sc = scoreLayout(boxesOf(trial), relations, routeOpts)
      // 重叠比交叉更难读（压线完全分不清哪条线是哪条），所以重叠的权重给得更高
      const cost = sc.len + 3 * sc.overlap + 120 * sc.cross
      if (cost < bestCost) {
        bestCost = cost
        pos = trial
      }
    }
  }

  const routed = routeRelations(boxesOf(pos), relations, routeOpts)

  const placer = makeLabelPlacer(
    entities.map((ent) => {
      const p = pos.get(ent.id)!
      return { x: p.x, y: p.y, w: p.w, h: p.h }
    }),
  )

  let paths = ''
  let labels = ''
  for (const rd of routed) {
    const rel = relations.find((r) => r.id === rd.id)
    paths += `<path d="${erPathD(rd.points)}" fill="none" stroke="#000" stroke-width="1.4"/>`
    // 基数标注也走放置器：寻线引擎在"候选点全被表框挡住"时会兜底把标注落回表内
    // （实测「1」压住 admin_id/username 两行文字），这里用同一条折线上的锚点把它挪出去。
    if (rel?.srcCard && rd.srcCardAt) {
      const at = placer.place(rd.srcCardAt.x, rd.srcCardAt.y, rel.srcCard, 13, labelAltPoints(rd.points))
      labels += erText(at.x, at.y, rel.srcCard, 13)
    }
    if (rel?.tgtCard && rd.tgtCardAt) {
      const at = placer.place(rd.tgtCardAt.x, rd.tgtCardAt.y, rel.tgtCard, 13, labelAltPoints(rd.points))
      labels += erText(at.x, at.y, rel.tgtCard, 13)
    }
    if (rel?.label) {
      const mid = midOfPolyline(rd.points)
      const at = placer.place(mid[0], mid[1] - 10, rel.label, 12, labelAltPoints(rd.points))
      labels += erText(at.x, at.y, rel.label, 12)
    }
  }

  let boxes = ''
  for (const ent of entities) {
    const p = pos.get(ent.id)!
    const fields = fieldsOf(ent)
    boxes += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    boxes += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${HEAD}" fill="#f0f0f0" stroke="#000" stroke-width="1"/>`
    boxes += `<text x="${p.cx}" y="${p.y + HEAD / 2 + 5}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="${ER_ENTITY_FONT}" font-weight="bold" text-anchor="middle" fill="#000">${esc(labelOf(ent))}</text>`
    fields.forEach((f, i) => {
      const ty = p.y + HEAD + i * ROW + ROW / 2 + 4
      const rowTop = p.y + HEAD + i * ROW
      if (i > 0) {
        boxes += `<line x1="${p.x}" y1="${rowTop}" x2="${p.x + p.w}" y2="${rowTop}" stroke="#eee" stroke-width="1"/>`
      }
      // 主键行浅色底纹，一眼能认出主键
      if (f.pk) {
        boxes += `<rect x="${p.x + 1}" y="${rowTop + 1}" width="${p.w - 2}" height="${ROW - 1}" fill="#f7f7f7"/>`
      }
      const name = `${f.name}${f.type ? ': ' + f.type : ''}`
      const mark = [f.pk ? 'PK' : '', f.fk ? 'FK' : ''].filter(Boolean).join(' ')
      boxes += `<text x="${p.x + 8}" y="${ty}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="12" fill="#000"${f.pk ? ' text-decoration="underline"' : ''}>${esc(name)}</text>`
      if (mark) {
        boxes += `<text x="${p.x + p.w - 8}" y="${ty}" font-family="'SimHei', 'Microsoft YaHei', sans-serif" font-size="10" text-anchor="end" fill="#888">${mark}</text>`
      }
    })
  }
  const frames = erGroupFrames(entities, pos, heightOf)

  const bb = bounds([
    ...Array.from(pos.values()).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
    ...routed.flatMap((rd) => rd.points.map((pt) => ({ x: pt[0], y: pt[1], w: 0, h: 0 }))),
  ])
  const pad = 40
  return wrapSvg(frames + paths + labels + boxes, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

/**
 * ER 图入口：按表示法分派。
 * · chen      陈氏表示法：实体 + 菱形联系 + 基数（原有实现）
 * · entity    只有实体连接：实体之间直接连线，不画菱形
 * · attribute 实体 + 字段环绕：字段画成实体周围的椭圆（陈氏属性图风格）
 * · table     表格型：每个实体是一张表（标题 + 字段行），表间直连
 */
export function erSvg(nodes: DNode[], edges: Edge[], opts: { notation?: ERNotation } = {}): string {
  switch (opts.notation || 'chen') {
    case 'entity':
      return erSvgDirect(nodes, edges)
    case 'attribute':
      return erSvgAttribute(nodes, edges)
    case 'table':
      return erSvgTable(nodes, edges)
    default:
      return erSvgChen(nodes, edges)
  }
}

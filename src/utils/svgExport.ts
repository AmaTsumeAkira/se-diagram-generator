import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'
import { layoutTreeStructure } from './layout'

type DNode = Node<DiagramNodeData>

// ====== Helpers ======

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function bounds(nodes: { x: number; y: number; w?: number; h?: number }[]) {
  if (nodes.length === 0) return { x: 0, y: 0, w: 400, h: 300 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + (n.w || 80)); maxY = Math.max(maxY, n.y + (n.h || 30))
  })
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
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
      let w = 0; for (const ch of (uc.data.label as string)) w += ch.charCodeAt(0) > 127 ? 14 : 8
      return Math.max(m, w)
    }, 0)
    const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

    // stick figure
    const ax = baseX + 40; const ay = actorY
    svg += `<g stroke="#000" stroke-width="1.5" fill="none"><circle cx="${ax + 27}" cy="${ay + 12}" r="10"/><line x1="${ax + 27}" y1="${ay + 22}" x2="${ax + 27}" y2="${ay + 68}"/><line x1="${ax + 27}" y1="${ay + 40}" x2="${ax}" y2="${ay + 40}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 10}" y2="${ay + 102}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 44}" y2="${ay + 102}"/></g>`
    svg += `<text x="${ax + 27}" y="${ay + 120}" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#000">${esc(g.actor.data.label as string)}</text>`

    // use case ellipses + lines
    g.useCases.forEach((uc, ui) => {
      const ucy = startY + ui * spacing
      svg += `<line x1="${ax + 55}" y1="${ay + 40}" x2="${ucCx - rx}" y2="${ucy}" stroke="#000" stroke-width="1" marker-end="url(#arrow)"/>`
      svg += `<ellipse cx="${ucCx}" cy="${ucy}" rx="${rx}" ry="15" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${ucCx}" y="${ucy + 5}" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#000">${esc(uc.data.label as string)}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: 360 })
    gi++
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Structure SVG ======

export function structureSvg(nodes: DNode[], edges: Edge[]): string {
  const { nodes: ln } = layoutTreeStructure(nodes, edges)
  const nodeMap = new Map(ln.map((n) => [n.id, n]))
  let svg = ''

  ln.forEach((n) => {
    const x = n.position.x; const y = n.position.y
    const label = esc(n.data.label as string)
    const vert = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const vh = (n.data.nodeH as number) || 110
    const vw = Math.max(18, fs * 1.2)

    if (vert) {
      svg += `<rect x="${x}" y="${y}" width="${vw}" height="${vh}" fill="#fff" stroke="#000" stroke-width="1"/>`
      // vertical text char by char
      const chars = (n.data.label as string).split('')
      const ls = Math.max(1, fs * 0.15)
      const charH = fs + ls
      const startY = y + (vh - chars.length * charH + ls) / 2 + fs * 0.8
      chars.forEach((ch, ci) => {
        svg += `<text x="${x + vw / 2}" y="${startY + ci * charH}" font-family="sans-serif" font-size="${fs}" text-anchor="middle" fill="#000">${esc(ch)}</text>`
      })
    } else {
      const h = (n.data.nodeH as number) || (fs * 1.6)
      const w = (n.data.nodeW as number) || n.measured?.width || Math.max(80, label.length * fs * 0.8 + 32)
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${x + w / 2}" y="${y + h / 2 + fs * 0.3}" font-family="sans-serif" font-size="${fs}" text-anchor="middle" fill="#000">${label}</text>`
    }
  })

  // step edges
  edges.forEach((e) => {
    const src = nodeMap.get(e.source); const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return
    const sx = src.position.x + ((src.measured?.width as number) || 80) / 2
    const sy = src.position.y + (src.data.vertical ? (src.data.nodeH as number || 110) : ((src.data.nodeH as number) || (src.data.fontSize as number || 14) * 1.6))
    const tx = tgt.position.x + (tgt.data.vertical ? Math.max(18, (tgt.data.fontSize as number || 14) * 1.2) : (tgt.measured?.width as number) || 80) / 2
    const ty = tgt.position.y
    const oy = (ty - sy) / 2
    svg += `<path d="M ${sx} ${sy} L ${sx} ${sy + oy} L ${tx} ${sy + oy} L ${tx} ${ty}" fill="none" stroke="#000" stroke-width="1"/>`
  })

  const bb = bounds(ln.map((n) => {
    const v = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const h = v ? ((n.data.nodeH as number) || 110) : ((n.data.nodeH as number) || fs * 1.6)
    const w = v ? Math.max(18, fs * 1.2) : ((n.data.nodeW as number) || n.measured?.width || 80)
    return { x: n.position.x, y: n.position.y, w, h }
  }))
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
    const attrIds = new Set(entEdges.map((e) => e.target))
    const attrs = nodes.filter((n) => n.type === 'ellipse' && attrIds.has(n.id))
    const n = attrs.length
    const a = 100 + n * 10; const b = Math.round(a * 0.55)

    // entity rectangle
    const ew = 90; const eh = 36
    svg += `<rect x="${cx - ew / 2}" y="${cy - eh / 2}" width="${ew}" height="${eh}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svg += `<text x="${cx}" y="${cy + 5}" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#000">${esc(ent.data.label as string)}</text>`

    // attributes + lines
    attrs.forEach((attr, ai) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * ai) / n
      const ax = cx + a * Math.cos(angle); const ay = cy + b * Math.sin(angle)
      const rx = 45; const ry = 18
      svg += `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#000" stroke-width="1.2"/>`
      svg += `<ellipse cx="${ax}" cy="${ay}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="1.2"/>`
      svg += `<text x="${ax}" y="${ay + 5}" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#000">${esc(attr.data.label as string)}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: cellH })
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

function wrapSvg(content: string, x: number, y: number, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${content}</svg>`
}

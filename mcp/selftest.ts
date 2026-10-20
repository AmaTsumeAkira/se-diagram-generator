/**
 * 引擎自检：在 Node 里把 9 类图各渲染一遍 SVG + VSDX。
 * 运行：npx tsx mcp/selftest.ts
 */
import { DIAGRAM_TYPES, ER_NOTATIONS, renderSvg, renderVsdx, type DiagramSpec, type DiagramType } from './engine.ts'

const samples: Record<DiagramType, DiagramSpec> = {
  usecase: {
    type: 'usecase',
    nodes: [
      { id: 'a1', type: 'actor', label: '用户' },
      { id: 'u1', type: 'usecase', label: '登录', rx: 60, ry: 15 },
      { id: 'u2', type: 'usecase', label: '下单', rx: 60, ry: 15 },
    ],
    edges: [
      { id: 'e1', source: 'a1', target: 'u1' },
      { id: 'e2', source: 'a1', target: 'u2' },
    ],
  },
  structure: {
    type: 'structure',
    nodes: [
      { id: 'root', type: 'rectangle', label: '系统' },
      { id: 'm1', type: 'rectangle', label: '用户管理' },
      { id: 'm2', type: 'rectangle', label: '数据管理' },
      { id: 'f1', type: 'rectangle', label: '用户注册', vertical: true },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'm1' },
      { id: 'e2', source: 'root', target: 'm2' },
      { id: 'e3', source: 'm1', target: 'f1' },
    ],
  },
  entity: {
    type: 'entity',
    nodes: [
      { id: 'ent', type: 'rectangle', label: '学生' },
      { id: 'a1', type: 'ellipse', label: '学号' },
      { id: 'a2', type: 'ellipse', label: '姓名' },
    ],
    edges: [
      { id: 'e1', source: 'ent', target: 'a1' },
      { id: 'e2', source: 'ent', target: 'a2' },
    ],
  },
  er: {
    type: 'er',
    nodes: [
      { id: 'ent_user', type: 'erEntity', label: '用户', fields: [{ name: 'id', type: 'INT', pk: true }, { name: 'name', type: 'VARCHAR(50)' }] },
      { id: 'ent_order', type: 'erEntity', label: '订单', fields: [{ name: 'id', type: 'INT', pk: true }, { name: 'user_id', type: 'INT', fk: true }] },
    ],
    edges: [{ id: 'r1', source: 'ent_user', target: 'ent_order', label: '拥有', data: { sourceCard: '1', targetCard: 'N' } }],
  },
  sequence: {
    type: 'sequence',
    nodes: [
      { id: 'p_user', type: 'participant', label: '用户', participantType: 'actor' },
      { id: 'p_sys', type: 'participant', label: '系统', participantType: 'system' },
      { id: 'p_db', type: 'participant', label: '数据库', participantType: 'database' },
    ],
    edges: [
      { id: 'm1', source: 'p_user', target: 'p_sys', label: '登录请求', data: { messageType: 'sync' } },
      { id: 'm2', source: 'p_sys', target: 'p_db', label: '查询用户', data: { messageType: 'sync' } },
      { id: 'm3', source: 'p_sys', target: 'p_user', label: '登录成功', data: { messageType: 'return' } },
    ],
  },
  class: {
    type: 'class',
    nodes: [
      { id: 'animal', type: 'class', label: '动物', attributes: ['- name: String'], methods: ['+ eat()'], isAbstract: true },
      { id: 'dog', type: 'class', label: '狗', attributes: ['- breed: String'], methods: ['+ bark()'] },
      { id: 'iface', type: 'interface', label: '可奔跑', methods: ['+ run()'] },
    ],
    edges: [
      { id: 'e1', source: 'dog', target: 'animal', data: { relationType: 'inheritance' } },
      { id: 'e2', source: 'dog', target: 'iface', data: { relationType: 'implementation' } },
    ],
  },
  activity: {
    type: 'activity',
    nodes: [
      { id: 's', type: 'start', label: '开始' },
      { id: 'a1', type: 'action', label: '提交申请' },
      { id: 'd1', type: 'decision', label: '是否通过' },
      { id: 'a2', type: 'action', label: '驳回' },
      { id: 'e', type: 'end', label: '结束' },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'd1' },
      { id: 'e3', source: 'd1', target: 'a2', data: { guard: '否' } },
      { id: 'e4', source: 'd1', target: 'e', data: { guard: '是' } },
    ],
  },
  deployment: {
    type: 'deployment',
    nodes: [
      { id: 'd_web', type: 'server', label: 'Web 服务器', technology: 'Nginx' },
      { id: 'd_app', type: 'server', label: '应用服务器', technology: 'Spring Boot' },
      { id: 'd_db', type: 'database', label: '数据库服务器', technology: 'MySQL 8.0' },
    ],
    edges: [
      { id: 'e1', source: 'd_web', target: 'd_app' },
      { id: 'e2', source: 'd_app', target: 'd_db' },
    ],
  },
  flowchart: {
    type: 'flowchart',
    nodes: [
      { id: 's', type: 'start', label: '开始' },
      { id: 'p1', type: 'process', label: '读取数据' },
      { id: 'd1', type: 'decision', label: '数据有效？' },
      { id: 'p2', type: 'process', label: '报错退出' },
      { id: 'e', type: 'end', label: '结束' },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'p1' },
      { id: 'e2', source: 'p1', target: 'd1' },
      { id: 'e3', source: 'd1', target: 'p2' },
      { id: 'e4', source: 'd1', target: 'e' },
    ],
  },
}

let failures = 0
for (const type of DIAGRAM_TYPES) {
  const spec = samples[type]
  try {
    const svg = await renderSvg(spec, 'chen')
    const { buffer } = await renderVsdx(spec)
    const okSvg = svg.startsWith('<svg') && svg.includes('</svg>')
    const okVsdx = buffer.subarray(0, 2).toString() === 'PK'
    if (!okSvg || !okVsdx) throw new Error(`格式校验失败 svg=${okSvg} vsdx=${okVsdx}`)
    console.log(`PASS ${type.padEnd(11)} svg=${String(svg.length).padStart(6)}B vsdx=${String(buffer.length).padStart(5)}B`)
  } catch (e) {
    failures++
    console.log(`FAIL ${type}: ${(e as Error).message}`)
  }
}

// ER 四种表示法
for (const notation of ER_NOTATIONS) {
  try {
    const svg = await renderSvg(samples.er, notation)
    console.log(`PASS er/${notation.padEnd(10)} svg=${String(svg.length).padStart(6)}B`)
  } catch (e) {
    failures++
    console.log(`FAIL er/${notation}: ${(e as Error).message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`)
  process.exit(1)
}
console.log('\n全部通过：9 类图 SVG/VSDX + ER 四种表示法')

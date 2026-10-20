/**
 * 图类型目录：给 MCP 客户端（LLM）看的「怎么画」说明书。
 * 字段与 src/types/diagram.ts + 各渲染器保持一致；示例就是编辑器导入用的平面 JSON。
 */
import type { DiagramSpec, DiagramType, ERNotation } from './engine.ts'

export interface NodeTypeDoc {
  type: string
  data: Record<string, string>
}

export interface DiagramTypeDoc {
  type: DiagramType
  label: string
  nodeTypes: NodeTypeDoc[]
  edgeData: Record<string, string>
  notes: string[]
  example: DiagramSpec
}

export const CATALOG: Record<DiagramType, DiagramTypeDoc> = {
  usecase: {
    type: 'usecase',
    label: '用例图',
    nodeTypes: [
      { type: 'actor', data: { label: '参与者名称' } },
      { type: 'usecase', data: { label: '用例名称', rx: '椭圆横半径（默认 45）', ry: '椭圆纵半径（默认 18）' } },
    ],
    edgeData: { label: '可选，连线文字' },
    notes: [
      '边方向：actor → usecase（每个用例必须挂在某个角色下）',
      '同一个用例 id 被多个角色引用时，编辑器会自动派生独立 id；建议直接给每个角色各自的用例唯一 id',
    ],
    example: {
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
  },
  structure: {
    type: 'structure',
    label: '功能结构图',
    nodeTypes: [{ type: 'rectangle', data: { label: '模块名', vertical: '叶子节点是否竖排（true/false）' } }],
    edgeData: { label: '可选' },
    notes: ['边方向：父模块 → 子模块；根节点只有一个，整张图是一棵树'],
    example: {
      type: 'structure',
      nodes: [
        { id: 'root', type: 'rectangle', label: '系统' },
        { id: 'm1', type: 'rectangle', label: '用户管理' },
        { id: 'f1', type: 'rectangle', label: '用户注册', vertical: true },
      ],
      edges: [
        { id: 'e1', source: 'root', target: 'm1' },
        { id: 'e2', source: 'm1', target: 'f1' },
      ],
    },
  },
  entity: {
    type: 'entity',
    label: '实体属性图',
    nodeTypes: [
      { type: 'rectangle', data: { label: '实体名' } },
      { type: 'ellipse', data: { label: '属性名' } },
    ],
    edgeData: { label: '可选' },
    notes: ['边方向：entity → attribute', '同一个属性 id 被多个实体引用时编辑器会自动派生独立 id'],
    example: {
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
  },
  er: {
    type: 'er',
    label: '总体 ER 图',
    nodeTypes: [
      {
        type: 'erEntity',
        data: {
          label: '实体名',
          fields: "字段数组 [{ name: 'id', type: 'INT', pk: true, fk: false, comment: '编号' }]",
          x: '可选，实体左上角绝对坐标',
          y: '可选；省略时自动布局',
          group: '可选，虚线分组名',
        },
      },
      { type: 'erDiamond', data: { label: '联系名（仅 chen 陈氏表示法需要）' } },
    ],
    edgeData: { sourceCard: "源端基数，如 '1' | 'N' | 'M' | '0..1'", targetCard: '目标端基数', label: '联系名' },
    notes: [
      'notation 决定排版：table（表格型，推荐）、attribute（字段环绕）、entity（实体直连）、chen（陈氏菱形）',
      '关系最简写法：直接在实体之间连边，用边上的 label + data.sourceCard/targetCard 描述联系与基数；MCP 会按编辑器内部约定自动补成 erDiamond + 两条边（所有表示法共用这一份关系数据）',
      '也可以手写编辑器内部格式：erEntity + erDiamond + 两条边（entity → diamond → entity）',
      '省略 x/y 时由本地布局引擎自动排布',
    ],
    example: {
      type: 'er',
      nodes: [
        {
          id: 'ent_user',
          type: 'erEntity',
          label: '用户',
          fields: [
            { name: 'id', type: 'INT', pk: true },
            { name: 'name', type: 'VARCHAR(50)' },
          ],
        },
        {
          id: 'ent_order',
          type: 'erEntity',
          label: '订单',
          fields: [
            { name: 'id', type: 'INT', pk: true },
            { name: 'user_id', type: 'INT', fk: true },
          ],
        },
      ],
      edges: [{ id: 'r1', source: 'ent_user', target: 'ent_order', label: '拥有', data: { sourceCard: '1', targetCard: 'N' } }],
    },
  },
  sequence: {
    type: 'sequence',
    label: '时序图',
    nodeTypes: [
      {
        type: 'participant',
        data: { label: '参与者名', participantType: "可选：'actor' | 'system' | 'database'" },
      },
    ],
    edgeData: { messageType: "消息类型：'sync' | 'async' | 'return'" },
    notes: ['参与者的 nodes 顺序即从左到右的生命线顺序', 'messageType 为空时按 sync 处理'],
    example: {
      type: 'sequence',
      nodes: [
        { id: 'p_user', type: 'participant', label: '用户', participantType: 'actor' },
        { id: 'p_sys', type: 'participant', label: '系统', participantType: 'system' },
      ],
      edges: [{ id: 'm1', source: 'p_user', target: 'p_sys', label: '登录请求', data: { messageType: 'sync' } }],
    },
  },
  class: {
    type: 'class',
    label: '类图',
    nodeTypes: [
      {
        type: 'class',
        data: {
          label: '类名',
          attributes: "属性数组，如 ['- name: String']",
          methods: "方法数组，如 ['+ eat()']",
          isAbstract: '是否抽象类',
          stereotype: '可选，构造型文字',
        },
      },
      { type: 'interface', data: { label: '接口名', methods: '方法数组' } },
      { type: 'enum', data: { label: '枚举名', attributes: '枚举值数组' } },
    ],
    edgeData: {
      relationType: "'association' | 'inheritance' | 'implementation' | 'dependency' | 'aggregation' | 'composition'",
      sourceMultiplicity: '可选，源端多重性',
      targetMultiplicity: '可选，目标端多重性',
    },
    notes: ['继承/实现等空心三角箭头由 relationType 决定'],
    example: {
      type: 'class',
      nodes: [
        { id: 'animal', type: 'class', label: '动物', attributes: ['- name: String'], methods: ['+ eat()'], isAbstract: true },
        { id: 'dog', type: 'class', label: '狗', attributes: ['- breed: String'], methods: ['+ bark()'] },
      ],
      edges: [{ id: 'e1', source: 'dog', target: 'animal', data: { relationType: 'inheritance' } }],
    },
  },
  activity: {
    type: 'activity',
    label: '活动图',
    nodeTypes: [
      { type: 'start', data: { label: '开始' } },
      { type: 'end', data: { label: '结束' } },
      { type: 'action', data: { label: '动作名' } },
      { type: 'decision', data: { label: '判断条件' } },
      { type: 'fork', data: { label: '分叉' } },
      { type: 'join', data: { label: '汇合' } },
    ],
    edgeData: { guard: '可选，条件文字' },
    notes: ['从 start 出发，到 end 结束；判断节点的出边用 data.guard 写条件'],
    example: {
      type: 'activity',
      nodes: [
        { id: 's', type: 'start', label: '开始' },
        { id: 'a1', type: 'action', label: '提交申请' },
        { id: 'd1', type: 'decision', label: '是否通过' },
        { id: 'e', type: 'end', label: '结束' },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'a1' },
        { id: 'e2', source: 'a1', target: 'd1' },
        { id: 'e3', source: 'd1', target: 'e', data: { guard: '是' } },
      ],
    },
  },
  deployment: {
    type: 'deployment',
    label: '部署图',
    nodeTypes: [
      { type: 'server', data: { label: '服务器名', technology: '可选，技术栈' } },
      { type: 'database', data: { label: '数据库名', technology: '可选' } },
      { type: 'node', data: { label: '节点名' } },
      { type: 'artifact', data: { label: '制品名' } },
      { type: 'component', data: { label: '组件名' } },
      { type: 'browser', data: { label: '浏览器' } },
      { type: 'mobile', data: { label: '移动端' } },
    ],
    edgeData: { label: '可选，通信协议' },
    notes: ['边方向：调用方 → 被调用方'],
    example: {
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
  },
  flowchart: {
    type: 'flowchart',
    label: '程序流程图',
    nodeTypes: [
      { type: 'start', data: { label: '开始（胶囊）' } },
      { type: 'end', data: { label: '结束（胶囊）' } },
      { type: 'process', data: { label: '处理步骤（直角矩形）' } },
      { type: 'decision', data: { label: '判断（菱形）' } },
    ],
    edgeData: { label: '可选，分支文字（是/否）' },
    notes: ['经典流程图符号：开始/结束用胶囊、处理用矩形、判断用菱形'],
    example: {
      type: 'flowchart',
      nodes: [
        { id: 's', type: 'start', label: '开始' },
        { id: 'p1', type: 'process', label: '读取数据' },
        { id: 'd1', type: 'decision', label: '数据有效？' },
        { id: 'e', type: 'end', label: '结束' },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'p1' },
        { id: 'e2', source: 'p1', target: 'd1' },
        { id: 'e3', source: 'd1', target: 'e', label: '是' },
      ],
    },
  },
}

export const NOTATION_DOC: Record<ERNotation, string> = {
  table: '表格型：实体画成表格，字段分行，最紧凑',
  attribute: '字段环绕：实体圆角框 + 字段环绕在四周',
  entity: '实体直连：实体框之间直接连线，连线标基数',
  chen: '陈氏：实体矩形 + 联系菱形 + 属性椭圆，需要 erDiamond 节点',
}

/** 给 LLM 的完整说明书（JSON 字符串） */
export function catalogJson(types?: DiagramType[]): string {
  const picked = types && types.length ? types : (Object.keys(CATALOG) as DiagramType[])
  return JSON.stringify(
    {
      contract: {
        format: '与编辑器「导入/导出」完全相同的平面 JSON',
        node: { id: 'string（必填，图内唯一）', type: '节点类型（必填）', label: '显示文字', '...': '按图类型附加的字段' },
        edge: { id: '可选', source: '起点节点 id', target: '终点节点 id', label: '可选文字', data: '按图类型附加的数据' },
        import: '这些 JSON 可以直接粘贴/导入到编辑器，也可以作为 MCP 工具的输入',
      },
      types: picked.map((t) => CATALOG[t]),
      erNotations: NOTATION_DOC,
      tips: [
        '先用 diagram_catalog 确认节点/边字段，再调用 diagram_render 或 diagram_send',
        'diagram_send 会通过本地桥接实时推送到打开的编辑器页面（不覆盖其他图，除非 apply=replace）',
        'diagram_get 可以读回编辑器当前的全部配置，用于继续修改',
      ],
    },
    null,
    2,
  )
}

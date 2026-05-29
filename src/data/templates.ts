import type { Template } from '../types/template'

// ====== 用例图模板 ======
export const useCaseTemplates: Template[] = [
  {
    id: 'uc-basic-login',
    name: '用户登录用例图',
    description: '基本的用户登录系统用例图',
    diagramType: 'usecase',
    category: 'general',
    complexity: 'basic',
    tags: ['登录', '认证', '基础'],
    config: {
      nodes: [
        { id: 'a1', type: 'actor', data: { label: '用户' }, position: { x: 0, y: 0 } },
        { id: 'u1', type: 'usecase', data: { label: '登录', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u2', type: 'usecase', data: { label: '注册', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u3', type: 'usecase', data: { label: '找回密码', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'a1', target: 'u1' },
        { id: 'e2', source: 'a1', target: 'u2' },
        { id: 'e3', source: 'a1', target: 'u3' },
      ]
    }
  },
  {
    id: 'uc-ecommerce',
    name: '电商系统用例图',
    description: '电商平台的核心用例',
    diagramType: 'usecase',
    category: 'ecommerce',
    complexity: 'intermediate',
    tags: ['电商', '购物', '订单'],
    config: {
      nodes: [
        { id: 'a1', type: 'actor', data: { label: '买家' }, position: { x: 0, y: 0 } },
        { id: 'a2', type: 'actor', data: { label: '卖家' }, position: { x: 0, y: 0 } },
        { id: 'u1', type: 'usecase', data: { label: '浏览商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u2', type: 'usecase', data: { label: '下单购买', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u3', type: 'usecase', data: { label: '发布商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u4', type: 'usecase', data: { label: '管理订单', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'a1', target: 'u1' },
        { id: 'e2', source: 'a1', target: 'u2' },
        { id: 'e3', source: 'a2', target: 'u3' },
        { id: 'e4', source: 'a2', target: 'u4' },
      ]
    }
  },
  {
    id: 'uc-hospital',
    name: '医院管理系统用例图',
    description: '医院挂号、就诊、取药流程',
    diagramType: 'usecase',
    category: 'medical',
    complexity: 'intermediate',
    tags: ['医疗', '挂号', '就诊'],
    config: {
      nodes: [
        { id: 'a1', type: 'actor', data: { label: '患者' }, position: { x: 0, y: 0 } },
        { id: 'a2', type: 'actor', data: { label: '医生' }, position: { x: 0, y: 0 } },
        { id: 'u1', type: 'usecase', data: { label: '预约挂号', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u2', type: 'usecase', data: { label: '在线问诊', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
        { id: 'u3', type: 'usecase', data: { label: '开具处方', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'a1', target: 'u1' },
        { id: 'e2', source: 'a1', target: 'u2' },
        { id: 'e3', source: 'a2', target: 'u2' },
        { id: 'e4', source: 'a2', target: 'u3' },
      ]
    }
  },
]

// ====== 功能结构图模板 ======
export const structureTemplates: Template[] = [
  {
    id: 'st-basic-system',
    name: '基本系统结构图',
    description: '三层架构的系统功能结构',
    diagramType: 'structure',
    category: 'general',
    complexity: 'basic',
    tags: ['基础', '三层架构'],
    config: {
      nodes: [
        { id: 'root', type: 'rectangle', data: { label: '系统' }, position: { x: 0, y: 0 } },
        { id: 'm1', type: 'rectangle', data: { label: '用户管理' }, position: { x: 0, y: 0 } },
        { id: 'm2', type: 'rectangle', data: { label: '数据管理' }, position: { x: 0, y: 0 } },
        { id: 'm3', type: 'rectangle', data: { label: '系统设置' }, position: { x: 0, y: 0 } },
        { id: 'f1', type: 'rectangle', data: { label: '用户注册', vertical: true }, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'rectangle', data: { label: '用户登录', vertical: true }, position: { x: 0, y: 0 } },
        { id: 'f3', type: 'rectangle', data: { label: '数据查询', vertical: true }, position: { x: 0, y: 0 } },
        { id: 'f4', type: 'rectangle', data: { label: '数据导出', vertical: true }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'root', target: 'm1' },
        { id: 'e2', source: 'root', target: 'm2' },
        { id: 'e3', source: 'root', target: 'm3' },
        { id: 'e4', source: 'm1', target: 'f1' },
        { id: 'e5', source: 'm1', target: 'f2' },
        { id: 'e6', source: 'm2', target: 'f3' },
        { id: 'e7', source: 'm2', target: 'f4' },
      ]
    }
  },
]

// ====== 实体属性图模板 ======
export const entityTemplates: Template[] = [
  {
    id: 'er-user',
    name: '用户实体属性图',
    description: '用户实体及其属性',
    diagramType: 'entity',
    category: 'general',
    complexity: 'basic',
    tags: ['用户', '基础'],
    config: {
      nodes: [
        { id: 'user', type: 'rectangle', data: { label: '用户' }, position: { x: 0, y: 0 } },
        { id: 'a1', type: 'ellipse', data: { label: '用户ID', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a2', type: 'ellipse', data: { label: '用户名', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a3', type: 'ellipse', data: { label: '密码', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a4', type: 'ellipse', data: { label: '邮箱', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a5', type: 'ellipse', data: { label: '手机号', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'user', target: 'a1' },
        { id: 'e2', source: 'user', target: 'a2' },
        { id: 'e3', source: 'user', target: 'a3' },
        { id: 'e4', source: 'user', target: 'a4' },
        { id: 'e5', source: 'user', target: 'a5' },
      ]
    }
  },
  {
    id: 'er-order',
    name: '订单实体属性图',
    description: '订单实体及其属性',
    diagramType: 'entity',
    category: 'ecommerce',
    complexity: 'basic',
    tags: ['订单', '电商'],
    config: {
      nodes: [
        { id: 'order', type: 'rectangle', data: { label: '订单' }, position: { x: 0, y: 0 } },
        { id: 'a1', type: 'ellipse', data: { label: '订单号', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a2', type: 'ellipse', data: { label: '下单时间', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a3', type: 'ellipse', data: { label: '订单金额', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
        { id: 'a4', type: 'ellipse', data: { label: '订单状态', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'order', target: 'a1' },
        { id: 'e2', source: 'order', target: 'a2' },
        { id: 'e3', source: 'order', target: 'a3' },
        { id: 'e4', source: 'order', target: 'a4' },
      ]
    }
  },
]

// ====== 时序图模板 ======
export const sequenceTemplates: Template[] = [
  {
    id: 'seq-login',
    name: '用户登录时序图',
    description: '用户登录的时序交互',
    diagramType: 'sequence',
    category: 'general',
    complexity: 'basic',
    tags: ['登录', '时序'],
    config: {
      nodes: [
        { id: 'user', type: 'participant', data: { label: '用户', participantType: 'actor' }, position: { x: 0, y: 0 } },
        { id: 'frontend', type: 'participant', data: { label: '前端', participantType: 'system' }, position: { x: 0, y: 0 } },
        { id: 'backend', type: 'participant', data: { label: '后端', participantType: 'system' }, position: { x: 0, y: 0 } },
        { id: 'db', type: 'participant', data: { label: '数据库', participantType: 'database' }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'user', target: 'frontend', label: '输入用户名密码' },
        { id: 'e2', source: 'frontend', target: 'backend', label: '登录请求' },
        { id: 'e3', source: 'backend', target: 'db', label: '查询用户' },
        { id: 'e4', source: 'db', target: 'backend', label: '返回用户信息' },
        { id: 'e5', source: 'backend', target: 'frontend', label: '返回token' },
        { id: 'e6', source: 'frontend', target: 'user', label: '登录成功' },
      ]
    }
  },
  {
    id: 'seq-payment',
    name: '支付流程时序图',
    description: '订单支付的时序交互',
    diagramType: 'sequence',
    category: 'ecommerce',
    complexity: 'intermediate',
    tags: ['支付', '电商', '时序'],
    config: {
      nodes: [
        { id: 'user', type: 'participant', data: { label: '用户', participantType: 'actor' }, position: { x: 0, y: 0 } },
        { id: 'app', type: 'participant', data: { label: 'APP', participantType: 'system' }, position: { x: 0, y: 0 } },
        { id: 'payment', type: 'participant', data: { label: '支付系统', participantType: 'system' }, position: { x: 0, y: 0 } },
        { id: 'bank', type: 'participant', data: { label: '银行', participantType: 'system' }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'user', target: 'app', label: '确认支付' },
        { id: 'e2', source: 'app', target: 'payment', label: '创建支付订单' },
        { id: 'e3', source: 'payment', target: 'bank', label: '扣款请求' },
        { id: 'e4', source: 'bank', target: 'payment', label: '扣款结果' },
        { id: 'e5', source: 'payment', target: 'app', label: '支付结果' },
        { id: 'e6', source: 'app', target: 'user', label: '显示支付成功' },
      ]
    }
  },
]

// ====== 类图模板 ======
export const classTemplates: Template[] = [
  {
    id: 'cls-basic',
    name: '基础类图示例',
    description: '展示继承和关联关系的类图',
    diagramType: 'class',
    category: 'general',
    complexity: 'basic',
    tags: ['类图', '继承', '基础'],
    config: {
      nodes: [
        { id: 'animal', type: 'class', data: { label: '动物', attributes: ['- name: String', '- age: Int'], methods: ['+ eat()', '+ sleep()'], isAbstract: true }, position: { x: 0, y: 0 } },
        { id: 'dog', type: 'class', data: { label: '狗', attributes: ['- breed: String'], methods: ['+ bark()'] }, position: { x: 0, y: 0 } },
        { id: 'cat', type: 'class', data: { label: '猫', attributes: ['- color: String'], methods: ['+ meow()'] }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'dog', target: 'animal', data: { relationType: 'inheritance' } },
        { id: 'e2', source: 'cat', target: 'animal', data: { relationType: 'inheritance' } },
      ]
    }
  },
  {
    id: 'cls-user-system',
    name: '用户系统类图',
    description: '用户相关的类设计',
    diagramType: 'class',
    category: 'enterprise',
    complexity: 'intermediate',
    tags: ['用户', '类图', '设计'],
    config: {
      nodes: [
        { id: 'user', type: 'class', data: { label: 'User', attributes: ['- id: Long', '- username: String', '- password: String'], methods: ['+ login()', '+ logout()'] }, position: { x: 0, y: 0 } },
        { id: 'role', type: 'class', data: { label: 'Role', attributes: ['- id: Long', '- name: String'], methods: ['+ getPermissions()'] }, position: { x: 0, y: 0 } },
        { id: 'permission', type: 'class', data: { label: 'Permission', attributes: ['- id: Long', '- code: String'], methods: [] }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'user', target: 'role', data: { relationType: 'association', sourceMultiplicity: '1', targetMultiplicity: '*' } },
        { id: 'e2', source: 'role', target: 'permission', data: { relationType: 'association', sourceMultiplicity: '1', targetMultiplicity: '*' } },
      ]
    }
  },
]

// ====== 活动图模板 ======
export const activityTemplates: Template[] = [
  {
    id: 'act-order',
    name: '订单处理活动图',
    description: '订单从创建到完成的活动流程',
    diagramType: 'activity',
    category: 'ecommerce',
    complexity: 'intermediate',
    tags: ['订单', '流程', '电商'],
    config: {
      nodes: [
        { id: 'start', type: 'start', data: { label: '' }, position: { x: 0, y: 0 } },
        { id: 'create', type: 'action', data: { label: '创建订单' }, position: { x: 0, y: 0 } },
        { id: 'check', type: 'decision', data: { label: '库存检查' }, position: { x: 0, y: 0 } },
        { id: 'pay', type: 'action', data: { label: '等待支付' }, position: { x: 0, y: 0 } },
        { id: 'ship', type: 'action', data: { label: '发货' }, position: { x: 0, y: 0 } },
        { id: 'end', type: 'end', data: { label: '' }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'create' },
        { id: 'e2', source: 'create', target: 'check' },
        { id: 'e3', source: 'check', target: 'pay', data: { guard: '有库存' } },
        { id: 'e4', source: 'pay', target: 'ship' },
        { id: 'e5', source: 'ship', target: 'end' },
      ]
    }
  },
]

// ====== 部署图模板 ======
export const deploymentTemplates: Template[] = [
  {
    id: 'dep-basic',
    name: '基础部署架构图',
    description: '三层部署架构',
    diagramType: 'deployment',
    category: 'general',
    complexity: 'basic',
    tags: ['部署', '架构', '基础'],
    config: {
      nodes: [
        { id: 'client', type: 'server', data: { label: '客户端', technology: 'Browser' }, position: { x: 0, y: 0 } },
        { id: 'nginx', type: 'server', data: { label: 'Nginx', technology: '反向代理' }, position: { x: 0, y: 0 } },
        { id: 'app', type: 'server', data: { label: '应用服务器', technology: 'Node.js' }, position: { x: 0, y: 0 } },
        { id: 'db', type: 'database', data: { label: 'MySQL', technology: '数据库' }, position: { x: 0, y: 0 } },
        { id: 'redis', type: 'database', data: { label: 'Redis', technology: '缓存' }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'client', target: 'nginx' },
        { id: 'e2', source: 'nginx', target: 'app' },
        { id: 'e3', source: 'app', target: 'db' },
        { id: 'e4', source: 'app', target: 'redis' },
      ]
    }
  },
  {
    id: 'dep-microservice',
    name: '微服务部署架构图',
    description: '微服务架构部署',
    diagramType: 'deployment',
    category: 'enterprise',
    complexity: 'advanced',
    tags: ['微服务', '架构', '高级'],
    config: {
      nodes: [
        { id: 'gateway', type: 'server', data: { label: 'API网关', technology: 'Kong' }, position: { x: 0, y: 0 } },
        { id: 'user-svc', type: 'server', data: { label: '用户服务', technology: 'Spring Boot' }, position: { x: 0, y: 0 } },
        { id: 'order-svc', type: 'server', data: { label: '订单服务', technology: 'Spring Boot' }, position: { x: 0, y: 0 } },
        { id: 'user-db', type: 'database', data: { label: '用户DB', technology: 'MySQL' }, position: { x: 0, y: 0 } },
        { id: 'order-db', type: 'database', data: { label: '订单DB', technology: 'MySQL' }, position: { x: 0, y: 0 } },
        { id: 'mq', type: 'server', data: { label: '消息队列', technology: 'RabbitMQ' }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'gateway', target: 'user-svc' },
        { id: 'e2', source: 'gateway', target: 'order-svc' },
        { id: 'e3', source: 'user-svc', target: 'user-db' },
        { id: 'e4', source: 'order-svc', target: 'order-db' },
        { id: 'e5', source: 'user-svc', target: 'mq' },
        { id: 'e6', source: 'order-svc', target: 'mq' },
      ]
    }
  },
]

// ====== 所有模板 ======
export const allTemplates: Template[] = [
  ...useCaseTemplates,
  ...structureTemplates,
  ...entityTemplates,
  ...sequenceTemplates,
  ...classTemplates,
  ...activityTemplates,
  ...deploymentTemplates,
]

// ====== 按图表类型获取模板 ======
export function getTemplatesByType(diagramType: string): Template[] {
  return allTemplates.filter(t => t.diagramType === diagramType)
}

// ====== 按分类获取模板 ======
export function getTemplatesByCategory(category: string): Template[] {
  return allTemplates.filter(t => t.category === category)
}

// ====== 搜索模板 ======
export function searchTemplates(keyword: string): Template[] {
  const lower = keyword.toLowerCase()
  return allTemplates.filter(t => 
    t.name.toLowerCase().includes(lower) ||
    t.description.toLowerCase().includes(lower) ||
    t.tags.some(tag => tag.toLowerCase().includes(lower))
  )
}

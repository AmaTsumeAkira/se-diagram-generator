import type { ERState } from '../components/panels/NodeEditor'

interface AiERResult {
  entities: { id: string; label: string; row?: number; col?: number }[]
  relationships: {
    source: string
    target: string
    label: string
    sourceCard: string
    targetCard: string
  }[]
}

// Read API URL from user settings; falls back to DeepSeek official API URL
function getEffectiveApiUrl(): string {
  try {
    const val = localStorage.getItem('diagram-ai-api-url')
    if (val && val.trim()) return val.trim()
  } catch {}
  return 'https://api.deepseek.com/chat/completions'
}
function getEffectiveModel(): string {
  try {
    return localStorage.getItem('diagram-ai-model') || 'deepseek-v4-pro'
  } catch {
    return 'deepseek-v4-pro'
  }
}

function getAiThinking(): boolean {
  try {
    const val = localStorage.getItem('diagram-ai-thinking')
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

/**
 * Call the AI model to analyze SQL or text and generate ER diagram configuration.
 * @param input - SQL or natural language description
 * @param apiKey - API key for the model
 * @param withLayout - if true, AI also determines row/col grid positions for entities
 */
export async function generateERFromAI(input: string, apiKey: string, withLayout = true): Promise<ERState> {
  const layoutRule = withLayout
    ? `   - 【排版要求】：你需要在脑海中构建一个二维网格（如 3x3, 4x4 等），为每个实体分配合理的 \`row\`（行号，从0开始）和 \`col\`（列号，从0开始）。
   - 必须确保有联系的实体相互靠近（同行或同列，距离相近），并且连线尽量不跨越其他实体，以免连线和实体在图上重叠。`
    : ''

  const entityInterface = withLayout
    ? '{ id: string; label: string; row: number; col: number }'
    : '{ id: string; label: string }'

  const prompt = `你是一个资深的数据库架构师。用户将提供一段 SQL 建表语句或关于数据库的自然语言描述。
你的任务是：提取其中的所有实体（表），将英文表名准确翻译为易懂的中文名，并推断它们之间的逻辑关联。

规则：
1. 实体（表）：提取所有的表作为实体。'id' 必须是以 'ent_' 开头的原英文表名，'label' 必须是翻译好的纯中文名。
${layoutRule}
2. 关系（连线）：根据外键或业务逻辑推导实体间的关系。
   - 'source' 和 'target' 必须对应实体的 id。
   - 'label' 是一个简短的中文动词（例如 包含、属于、拥有、关联）。
   - 'sourceCard' 和 'targetCard' 必须是以下之一：'1', 'N', 'M', '0..1', '0..N'。通常外键代表源端是 N，目标端是 1。
3. 你必须只返回一个符合以下 TypeScript 接口的合法 JSON 对象，不要包含 Markdown 格式（如 \`\`\`json 标签），不要包含任何解释性文本。

interface Result {
  entities: ${entityInterface}[];
  relationships: { source: string; target: string; label: string; sourceCard: string; targetCard: string }[];
}

输入数据：
${input}
`

  try {
    const modelName = getEffectiveModel()
    const payload: any = {
      model: modelName,
      messages: [
        { role: 'system', content: '你是一个只输出合法 JSON 的 AI 助手。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    }

    const isThinking = getAiThinking()
    payload.thinking = { type: isThinking ? 'enabled' : 'disabled' }
    if (isThinking) {
      payload.reasoning_effort = 'high'
    }

    const response = await fetch(getEffectiveApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    // Clean up potential markdown formatting if the model disobeys
    const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    const result: AiERResult = JSON.parse(cleanContent)

    // Add unique IDs to relationships
    const relationships = (result.relationships || []).map((rel, i) => ({
      ...rel,
      id: `rel_ai_${Date.now()}_${i}`
    }))

    return {
      entities: (result.entities || []).map(e => ({
        id: e.id,
        label: e.label,
        ...(withLayout && e.row !== undefined && { row: e.row }),
        ...(withLayout && e.col !== undefined && { col: e.col }),
      })),
      relationships
    }
  } catch (error: any) {
    console.error('AI parse error:', error)
    throw new Error(`AI 解析失败: ${error.message}`)
  }
}

export interface AiClassResult {
  classes: {
    id: string
    label: string
    attributes: string[]
    methods: string[]
    isAbstract?: boolean
    stereotype?: string
  }[]
  relations: {
    id: string
    source: string
    target: string
    relationType: string
    label?: string
  }[]
}

export async function generateClassFromAI(input: string, apiKey: string): Promise<AiClassResult> {
  const prompt = `你是一个资深的软件架构师。用户将提供一段代码（Java/TypeScript等）或者一段自然语言描述的系统需求。
你的任务是：提取系统中的主要类及其属性、方法，并分析类之间的UML关系。

规则：
1. 类（Class）：提取系统中的类。'id' 使用英文或拼音缩写（不能重复），'label' 是类名。
   - 'attributes'：提取或推断该类的属性，以字符串数组形式返回（如 ["+ name: String", "- age: int"]）。尽量包含可见性修饰符(+ - #)和类型。
   - 'methods'：提取或推断该类的方法，以字符串数组形式返回（如 ["+ login(): void", "+ calculateTotal(): double"]）。
   - 'isAbstract'：如果这是一个抽象类或接口，设为 true。
   - 'stereotype'：如果有特定构造型（如 interface, enum, service），可以填写，否则留空。
2. 关系（Relations）：分析类之间的 UML 关系。
   - 'source'：指向起始类的 id（如子类、实现类、依赖方）。
   - 'target'：指向目标类的 id（如父类、接口、被依赖方）。
   - 'relationType' 必须是以下之一：'inheritance' (继承), 'implementation' (实现), 'dependency' (依赖), 'aggregation' (聚合), 'composition' (组合), 'association' (关联)。
   - 'label'：可选，关系的简短说明（如 'has-a', 'uses'）。
3. 返回 JSON：必须只返回一个符合以下 TypeScript 接口的合法 JSON 对象，不要包含 Markdown 格式（如 \`\`\`json 标签），不要包含任何解释性文本。

interface Result {
  classes: { id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string }[];
  relations: { source: string; target: string; relationType: string; label?: string }[];
}

输入数据：
${input}
`

  try {
    const modelName = getEffectiveModel()
    const payload: any = {
      model: modelName,
      messages: [
        { role: 'system', content: '你是一个只输出合法 JSON 的 AI 助手。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    }

    const isThinking = getAiThinking()
    payload.thinking = { type: isThinking ? 'enabled' : 'disabled' }
    if (isThinking) {
      payload.reasoning_effort = 'high'
    }

    const response = await fetch(getEffectiveApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    const result: AiClassResult = JSON.parse(cleanContent)

    const relations = (result.relations || []).map((rel, i) => ({
      ...rel,
      id: `rel_class_${Date.now()}_${i}`
    }))

    return {
      classes: result.classes || [],
      relations
    }
  } catch (error: any) {
    console.error('AI Class parse error:', error)
    throw new Error(`AI 解析类图失败: ${error.message}`)
  }
}


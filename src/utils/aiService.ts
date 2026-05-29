import type { ERState } from '../components/panels/NodeEditor'

interface AiERResult {
  entities: { id: string; label: string }[]
  relationships: {
    source: string
    target: string
    label: string
    sourceCard: string
    targetCard: string
  }[]
}

// Use relative path to hit the Vite proxy in development, or fallback to the CORS proxy in production
const BASE_API_URL = 'https://opencode.ai/zen/go/v1/chat/completions'
const API_URL = import.meta.env.DEV ? '/api/ai/zen/go/v1/chat/completions' : `https://corsproxy.io/?${encodeURIComponent(BASE_API_URL)}`
const MODEL_NAME = 'deepseek-v4-flash'

/**
 * Call the AI model to analyze SQL or text and generate ER diagram configuration.
 * It will translate table names into readable Chinese (or keep English if appropriate)
 * and analyze relationships.
 */
export async function generateERFromAI(input: string, apiKey: string): Promise<ERState> {
  const prompt = `你是一个资深的数据库架构师。用户将提供一段 SQL 建表语句或关于数据库的自然语言描述。
你的任务是：提取其中的所有实体（表），将英文表名准确翻译为易懂的中文名，推断它们之间的逻辑关联，并**为这些实体在二维网格中分配合理的坐标**。

规则：
1. 实体（表）：提取所有的表作为实体。'id' 必须是以 'ent_' 开头的原英文表名，'label' 必须是翻译好的纯中文名。
   - 【排版要求】：你需要在脑海中构建一个二维网格（如 3x3, 4x4 等），为每个实体分配合理的 \`row\`（行号，从0开始）和 \`col\`（列号，从0开始）。
   - 必须确保有联系的实体相互靠近（同行或同列，距离相近），并且连线尽量不跨越其他实体，以免连线和实体在图上重叠。
2. 关系（连线）：根据外键或业务逻辑推导实体间的关系。
   - 'source' 和 'target' 必须对应实体的 id。
   - 'label' 是一个简短的中文动词（例如 包含、属于、拥有、关联）。
   - 'sourceCard' 和 'targetCard' 必须是以下之一：'1', 'N', 'M', '0..1', '0..N'。通常外键代表源端是 N，目标端是 1。
3. 你必须只返回一个符合以下 TypeScript 接口的合法 JSON 对象，不要包含 Markdown 格式（如 \`\`\`json 标签），不要包含任何解释性文本。

interface Result {
  entities: { id: string; label: string; row: number; col: number }[];
  relationships: { source: string; target: string; label: string; sourceCard: string; targetCard: string }[];
}

输入数据：
${input}
`

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: 'You are an AI that outputs only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
      })
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
      entities: result.entities || [],
      relationships
    }
  } catch (error: any) {
    console.error('AI parse error:', error)
    throw new Error(`AI 解析失败: ${error.message}`)
  }
}

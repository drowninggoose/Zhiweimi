import type { Connect } from 'vite';

type Json = Record<string, unknown>;
export type AiGatewayConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

const utensilSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'type',
    'capacityMl',
    'rangeMinMl',
    'rangeMaxMl',
    'confidence',
    'reasoning',
    'needsConfirmation',
  ],
  properties: {
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: [
        'seasoning-spoon',
        'tablespoon',
        'bowl',
        'cup',
        'rice-cup',
        'pot',
        'pan',
        'wok',
        'baking-dish',
        'other',
      ],
    },
    capacityMl: { type: 'number' },
    rangeMinMl: { type: 'number' },
    rangeMaxMl: { type: 'number' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
    needsConfirmation: { type: 'boolean' },
  },
} as const;

const adaptationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'warnings', 'steps'],
  properties: {
    summary: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['instruction', 'heat', 'durationSeconds', 'tip', 'check'],
        properties: {
          instruction: { type: 'string' },
          heat: { type: 'string' },
          durationSeconds: { type: ['number', 'null'] },
          tip: { type: 'string' },
          check: { type: 'string' },
        },
      },
    },
  },
} as const;

function extractText(response: Json): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') throw new Error('模型没有返回候选结果');
  const message = (first as Json).message;
  if (!message || typeof message !== 'object') throw new Error('模型没有返回消息');
  const content = (message as Json).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is Json => Boolean(part && typeof part === 'object'))
      .map((part) => part.text)
      .filter((value): value is string => typeof value === 'string')
      .join('');
    if (text) return text;
  }
  throw new Error('模型没有返回结构化文本');
}

async function callModel(config: AiGatewayConfig, name: string, schema: Json, messages: unknown[]) {
  const apiKey = config.apiKey ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
  const model =
    config.model ?? process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'gemini-2.5-flash-lite';
  const baseUrl = (config.baseUrl ?? process.env.AI_BASE_URL ?? 'https://aihubmix.com/v1').replace(
    /\/$/,
    '',
  );
  if (!apiKey) throw new Error('服务端未配置 AI_API_KEY');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema },
      },
    }),
  });
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const error =
      body.error && typeof body.error === 'object' ? (body.error as Json).message : undefined;
    throw new Error(typeof error === 'string' ? error : `AI 请求失败（${response.status}）`);
  }
  return JSON.parse(extractText(body)) as Json;
}

async function readJson(req: Connect.IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 12 * 1024 * 1024) throw new Error('请求内容不能超过 12 MB');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
}

export function aiGateway(config: AiGatewayConfig = {}): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/ai/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: '仅支持 POST' }));
      return;
    }
    try {
      const body = await readJson(req);
      if (req.url === '/api/ai/analyze-utensil') {
        if (typeof body.imageDataUrl !== 'string' || !body.imageDataUrl.startsWith('data:image/'))
          throw new Error('缺少有效的厨具图片');
        const result = await callModel(
          config,
          'utensil_capacity',
          utensilSchema as unknown as Json,
          [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '识别图中的主要餐具并估算有效容量。单张照片没有尺度时必须扩大区间、降低置信度并要求用户确认。不要假装精确测量。容量统一为 ml。',
                },
                {
                  type: 'image_url',
                  image_url: { url: body.imageDataUrl, detail: 'high' },
                },
              ],
            },
          ],
        );
        res.end(JSON.stringify(result));
        return;
      }
      if (req.url === '/api/ai/adapt-recipe') {
        if (!body.recipe || !body.utensil || !Array.isArray(body.tastePreferences))
          throw new Error('缺少菜谱、厨具或口味偏好');
        const result = await callModel(
          config,
          'adapted_recipe',
          adaptationSchema as unknown as Json,
          [
            {
              role: 'system',
              content:
                '你是严谨的中式家庭烹饪助手。只根据厨具容量与辣度、甜度、咸淡、酸度、油腻程度等口味偏好改写步骤。不得根据过敏或忌口删除、替换食材。保留原菜谱事实，容量不合适时建议减量或分批，并给出防溢、防糊和熟度判断。',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    recipe: body.recipe,
                    utensil: body.utensil,
                    tastePreferences: body.tastePreferences,
                  }),
                },
              ],
            },
          ],
        );
        res.end(JSON.stringify(result));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: '未知 AI 接口' }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

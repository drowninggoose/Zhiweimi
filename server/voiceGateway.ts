import type { Connect } from 'vite';

/**
 * 语音助手网关。
 *
 * 与队友的 `aiGateway`（餐具识别 / 菜谱适配）**完全隔离**：
 * - 路由前缀不同：`/api/voice/*` vs `/api/ai/*`
 * - 环境变量不同：`VOICE_*` vs `AI_*`
 * - 供应商可不同：默认阿里百炼（ASR 走 DashScope 原生接口，对话走 OpenAI 兼容接口）
 *
 * 这样两边的 Key、额度、故障域互不影响。
 */

type Json = Record<string, unknown>;

export type VoiceGatewayConfig = {
  /** OpenAI 兼容 base（用于对话），默认阿里百炼 compatible-mode。 */
  baseUrl?: string;
  /** 对话模型。 */
  model?: string;
  /** DashScope 原生 base（用于语音识别）。 */
  dashscopeBase?: string;
  /** 语音识别模型。 */
  asrModel?: string;
  apiKey?: string;
};

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'qwen3.7-flash';
const DEFAULT_ASR_MODEL = 'qwen-audio-3.1-asr-flash';

/** 允许的意图，超出范围的会被过滤。 */
const INTENTS = ['remedy', 'suggest', 'recommend', 'remember', 'ask'] as const;

/** 允许的记忆维度，与前端 PreferenceMemory 对齐。 */
const DIMENSIONS = [
  'spiciness',
  'sweetness',
  'saltiness',
  'sourness',
  'greasiness',
  'seasoning',
  'liked_dish',
  'disliked_ingredient',
] as const;

/** 命令式表达 → 建议式表达。用于落实「只给建议、不给命令」。 */
const COMMAND_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /你必须/g, replacement: '你可以考虑' },
  { pattern: /您必须/g, replacement: '您可以考虑' },
  { pattern: /必须要/g, replacement: '可以考虑' },
  { pattern: /必须/g, replacement: '建议' },
  { pattern: /一定要/g, replacement: '可以考虑' },
  { pattern: /你应该/g, replacement: '你可以' },
  { pattern: /您应该/g, replacement: '您可以' },
  { pattern: /绝对要/g, replacement: '可以考虑' },
  { pattern: /立刻/g, replacement: '' },
  { pattern: /马上/g, replacement: '' },
  { pattern: /不准/g, replacement: '不太建议' },
];

/** 绝对化用语，用于测试与自检。 */
export const BANNED_COMMANDS = ['必须', '一定要', '你应该', '立刻', '马上', '绝对要'];

/** 把命令式语气改成建议式。纯函数，便于单元测试。 */
export function softenCommandLanguage(text: string): string {
  let result = text;
  for (const { pattern, replacement } of COMMAND_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // 去掉替换后产生的重复词与多余空格
  return result
    .replace(/可以可以/g, '可以')
    .replace(/建议建议/g, '建议')
    .replace(/考虑考虑/g, '考虑')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** 对话系统提示词：意图路由 + 只给建议 + 记忆判定。 */
function systemPrompt(): string {
  return [
    '你是「知味咪」厨房语音助手。用户正在做菜，可能手上很忙，回答要短、能听懂、能立刻用。',
    '',
    '输出必须是 JSON 对象，字段如下：',
    '{',
    '  "intents": 数组，取值只能来自 remedy / suggest / recommend / remember / ask，可多选；',
    '  "subtitle": 给用户看的一句话主回答，25 字以内，口语化；',
    '  "detail": 最多 3 条要点的数组，每条 30 字以内，可为空数组；',
    '  "memory": 数组，用户本轮**明确表达**的偏好，没有就给空数组；',
    '  "recommendQuery": 需要推荐菜谱时给出检索条件，否则为 null。',
    '}',
    '',
    '意图判定规则：',
    '- remedy：用户在说菜的状态不好（太淡/太咸/太辣/糊了/夹生等）或问怎么补救。',
    '- suggest：用户问这道菜接下来还有什么建议、要注意什么。',
    '- recommend：用户想要推荐别的菜。',
    '- remember：用户在陈述自己的口味偏好（我喜欢辣、别放香菜）。',
    '- ask：其它烹饪问题。',
    '',
    '记忆判定（非常重要）：',
    '- 只有用户**主动陈述偏好**才写入 memory，source 填 explicit。',
    '- 只是描述当前这道菜（这道菜有点淡）**不要**写入记忆，source 一律用 explicit，',
    '  由客户端决定是否累积成推断偏好。',
    '- memory 元素格式：{"dimension":"维度","polarity":-2到2的整数,"evidence":"用户原话片段"}',
    '- dimension 只能是：' + DIMENSIONS.join(' / '),
    '- polarity：正值表示"更多/更喜欢"，负值表示"更少/不喜欢"。',
    '',
    '语气要求（硬性）：',
    '- 只给建议，不下命令。禁止出现「必须」「一定要」「你应该」「立刻」「马上」这类绝对表达。',
    '- 涉及继续加热、加盐、加油这类动作时，必须说明理由，并给出可观察的判断标准，',
    '  例如"如果筷子还插不透，可以再煮 5~10 分钟看看"，而不是"再煮 10 分钟就熟了"。',
    '- 不要编造加热时间、温度等安全数值；只能复述菜谱原文给的数值。',
    '- 过敏与忌口信息**不得**用于修改菜谱或删除食材，只能用来提醒。',
    '',
    '不知道就说不确定，不要硬编。',
  ].join('\n');
}

/** 从模型返回里取出文本（兼容字符串与分段数组两种形式）。 */
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
  throw new Error('模型没有返回文本内容');
}

/** 从可能带 ```json 围栏的文本里解析 JSON。 */
function parseJsonLoose(text: string): Json {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON 对象');
  return JSON.parse(candidate.slice(start, end + 1)) as Json;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
}

/** 校验并规整模型返回的对话结果，防止脏数据流到前端。 */
export function normalizeChatResult(raw: Json): {
  intents: string[];
  subtitle: string;
  detail: string[];
  memory: { dimension: string; polarity: number; source: 'explicit'; evidence: string }[];
  recommendQuery: { flavors: string[]; exclude: string[] } | null;
} {
  const rawIntents = asStringArray(raw.intents);
  const intents = rawIntents.filter((item): item is (typeof INTENTS)[number] =>
    (INTENTS as readonly string[]).includes(item),
  );

  const memory: {
    dimension: string;
    polarity: number;
    source: 'explicit';
    evidence: string;
  }[] = [];
  if (Array.isArray(raw.memory)) {
    for (const item of raw.memory) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Json;
      const dimension = asString(record.dimension);
      if (!(DIMENSIONS as readonly string[]).includes(dimension)) continue;
      const polarity = Number(record.polarity);
      if (!Number.isFinite(polarity)) continue;
      memory.push({
        dimension,
        polarity: Math.max(-2, Math.min(2, Math.round(polarity))),
        source: 'explicit',
        evidence: asString(record.evidence).slice(0, 60),
      });
    }
  }

  let recommendQuery: { flavors: string[]; exclude: string[] } | null = null;
  if (raw.recommendQuery && typeof raw.recommendQuery === 'object') {
    const query = raw.recommendQuery as Json;
    recommendQuery = {
      flavors: asStringArray(query.flavors),
      exclude: asStringArray(query.exclude),
    };
  }

  const subtitle = softenCommandLanguage(asString(raw.subtitle, '我没太听懂，你可以再说一次吗？'));
  const detail = asStringArray(raw.detail).map((line) => softenCommandLanguage(line));

  return {
    intents: intents.length ? intents : ['ask'],
    subtitle,
    detail,
    memory,
    recommendQuery,
  };
}

async function callChatModel(
  config: VoiceGatewayConfig,
  messages: unknown[],
): Promise<Json> {
  const apiKey = config.apiKey ?? process.env.VOICE_API_KEY;
  const model = config.model ?? process.env.VOICE_MODEL ?? DEFAULT_MODEL;
  const baseUrl = (config.baseUrl ?? process.env.VOICE_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  if (!apiKey) throw new Error('服务端未配置 VOICE_API_KEY，请检查 .env');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      // 用 json_object 而非 json_schema：百炼对 json_object 支持稳定，
      // json_schema + strict 需要额外确认，这里不冒险。
      response_format: { type: 'json_object' },
    }),
  });
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const error =
      body.error && typeof body.error === 'object'
        ? (body.error as Json).message
        : body.message ?? undefined;
    throw new Error(typeof error === 'string' ? error : `对话模型请求失败（${response.status}）`);
  }
  return normalizeChatResult(parseJsonLoose(extractText(body)));
}

/**
 * 调用 DashScope 非实时语音识别。
 *
 * 接口是 DashScope 原生格式（不是 OpenAI 兼容），因此单独拼装。
 * 文档：非实时语音识别（Qwen-Audio-3.x-ASR-Flash）HTTP API
 */
async function callAsr(
  config: VoiceGatewayConfig,
  audioDataUrl: string,
  format: string,
  sampleRate?: number,
  vocabulary?: Record<string, number>,
  languageHints?: string[],
): Promise<{ text: string; duration?: number }> {
  const apiKey = config.apiKey ?? process.env.VOICE_API_KEY;
  const model = config.asrModel ?? process.env.VOICE_ASR_MODEL ?? DEFAULT_ASR_MODEL;
  const base = (config.dashscopeBase ?? process.env.VOICE_DASHSCOPE_BASE ?? DEFAULT_DASHSCOPE_BASE)
    .replace(/\/$/, '');
  if (!apiKey) throw new Error('服务端未配置 VOICE_API_KEY，请检查 .env');

  const parameters: Json = { format };
  if (sampleRate) parameters.sample_rate = String(sampleRate);
  if (vocabulary && Object.keys(vocabulary).length) parameters.vocabulary = vocabulary;
  if (languageHints?.length) parameters.language_hints = languageHints.slice(0, 4);

  const response = await fetch(
    `${base}/api/v1/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // 我们的语音是短句，不需要流式
        'X-DashScope-SSE': 'disable',
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ type: 'input_audio', input_audio: { data: audioDataUrl } }],
            },
          ],
        },
        parameters,
      }),
    },
  );
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const message =
      body.message ?? (body.error && typeof body.error === 'object' ? (body.error as Json).message : undefined);
    throw new Error(typeof message === 'string' ? message : `语音识别请求失败（${response.status}）`);
  }
  const output = (body.output ?? {}) as Json;
  const text = asString(output.text);
  const usage = (body.usage ?? {}) as Json;
  const duration = typeof usage.duration === 'number' ? usage.duration : undefined;
  if (!text.trim()) throw new Error('没有识别到语音内容，请靠近麦克风再试一次');
  return { text, duration };
}

async function readJson(req: Connect.IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16 * 1024 * 1024) throw new Error('请求内容不能超过 16 MB');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
}

/** 拼装对话用的用户消息（含当前烹饪上下文）。 */
function buildUserMessage(body: Json): string {
  const context = (body.context ?? {}) as Json;
  const lines: string[] = [];
  lines.push(`用户说：${asString(body.text)}`);
  if (context.recipeName) lines.push(`正在做的菜：${asString(context.recipeName)}`);
  if (typeof context.stepIndex === 'number') {
    const total = typeof context.stepTotal === 'number' ? ` / ${context.stepTotal}` : '';
    lines.push(`当前步骤：第 ${context.stepIndex + 1}${total} 步`);
  }
  if (context.stepInstruction) lines.push(`这一步原文：${asString(context.stepInstruction)}`);
  if (context.check) lines.push(`这一步的判断标准：${asString(context.check)}`);
  if (context.tip) lines.push(`这一步的技巧：${asString(context.tip)}`);
  const remedies = context.remedies;
  if (remedies && typeof remedies === 'object') {
    lines.push(
      `可用的本地补救方案：${JSON.stringify(remedies).slice(0, 600)}`,
    );
  }
  const taste = asStringArray(context.tastePreferences);
  if (taste.length) lines.push(`用户口味偏好：${taste.join('、')}`);
  const avoid = asStringArray(context.avoidIngredients);
  if (avoid.length) lines.push(`用户忌口（仅用于提醒，不得据此改菜谱）：${avoid.join('、')}`);
  return lines.join('\n');
}

export function voiceGateway(config: VoiceGatewayConfig = {}): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/voice/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: '仅支持 POST' }));
      return;
    }
    try {
      const body = await readJson(req);

      if (req.url === '/api/voice/asr') {
        const audioDataUrl = asString(body.audioDataUrl);
        if (!audioDataUrl.startsWith('data:audio/')) throw new Error('缺少有效的音频数据');
        const format = asString(body.format, 'wav');
        const sampleRate = typeof body.sampleRate === 'number' ? body.sampleRate : 16000;
        const vocabulary =
          body.vocabulary && typeof body.vocabulary === 'object'
            ? (body.vocabulary as Record<string, number>)
            : undefined;
        const languageHints = asStringArray(body.languageHints);
        const result = await callAsr(
          config,
          audioDataUrl,
          format,
          sampleRate,
          vocabulary,
          languageHints.length ? languageHints : ['zh'],
        );
        res.end(JSON.stringify(result));
        return;
      }

      if (req.url === '/api/voice/chat') {
        const text = asString(body.text).trim();
        if (!text) throw new Error('请先说话或输入问题');
        if (text.length > 500) throw new Error('一次说的话请控制在 500 字以内');
        const result = await callChatModel(config, [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: buildUserMessage(body) },
        ]);
        res.end(JSON.stringify(result));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: '未知语音接口' }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

import type { Connect } from 'vite';

/**
 * 语音助手网关（与队友的 aiGateway 完全隔离：路由 /api/voice/*，环境变量 VOICE_*）。
 *
 * 三个关键实测结论：
 * 1. 阿里百炼的 Qwen3 系列**默认开启思考模式**，一个简单做菜问题会消耗 2000+ 推理 token，
 *    单次耗时 30 秒左右。必须显式传 `enable_thinking: false`，实测可降到 2 秒级。
 * 2. `response_format: json_schema + strict` 在百炼上可用，能强制字段合法；
 *    而 `json_object` 模式要求提示词里出现 "json" 字样，否则直接 400。
 * 3. 回答质量的决定因素是**上下文是否完整**（食材+用量+完整步骤+当前步骤），
 *    而不是模型档次。因此这里把整道菜的配方都交给模型。
 */

type Json = Record<string, unknown>;

export type VoiceGatewayConfig = {
  baseUrl?: string;
  model?: string;
  dashscopeBase?: string;
  asrModel?: string;
  apiKey?: string;
};

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'qwen3.7-flash';
const DEFAULT_ASR_MODEL = 'qwen-audio-3.1-asr-flash';
/** 单次请求超时，避免极端情况卡死界面 */
const REQUEST_TIMEOUT_MS = 25_000;

const INTENTS = ['remedy', 'suggest', 'recommend', 'remember', 'ask'] as const;

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

/** 命令式表达 → 建议式表达。 */
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

export const BANNED_COMMANDS = ['必须', '一定要', '你应该', '立刻', '马上', '绝对要'];

export function softenCommandLanguage(text: string): string {
  let result = text;
  for (const { pattern, replacement } of COMMAND_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result
    .replace(/可以可以/g, '可以')
    .replace(/建议建议/g, '建议')
    .replace(/考虑考虑/g, '考虑')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * 清理回答正文里不该出现的「接口残留」。
 *
 * 模型偶尔会把 JSON 字段名直接写进 answer，例如：
 *   「关于推荐别的菜：flavors: 辣, 家常菜 / exclude: null」
 * 这些对用户毫无意义，必须删掉，只保留自然语言。
 */
export function cleanAnswer(text: string): string {
  const droppedFieldLine =
    /^\s*(flavors?|exclude|recommendQuery|intents?|actions?|memory|answer)\s*[:：]/i;
  const droppedHeader = /^关于(推荐|别的菜|菜品推荐)/;
  return text
    .split(/\r?\n/)
    .filter((line) => !droppedFieldLine.test(line) && !droppedHeader.test(line.trim()))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 抢救方案相关类型。
 *
 * 刻意在网关侧单独定义（与 `src/services/rescuePlan.ts` 结构一致但不跨项目引用），
 * 避免 server 的 tsconfig 去编译前端源码。
 */
export type RescueAction = { do: string; amount: string; when: string; check: string };
export type RescueStepPatch = {
  instruction: string;
  action?: string;
  heat?: string;
  durationSeconds?: number;
  check?: string;
  tip?: string;
};
export type RescuePlan = {
  diagnosis: string;
  fixes: RescueAction[];
  insertNow?: RescueStepPatch;
  remaining?: RescueStepPatch[];
};

function normalizeStepPatch(raw: unknown): RescueStepPatch | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Json;
  const instruction = asString(record.instruction).trim();
  if (!instruction) return undefined;
  const duration = Number(record.durationSeconds);
  return {
    instruction,
    action: asString(record.action) || undefined,
    heat: asString(record.heat) || undefined,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    check: asString(record.check) || undefined,
    tip: asString(record.tip) || undefined,
  };
}

/** 只有用户报告菜出问题时，模型才会给 rescue；这里做防御性解析。 */
export function normalizeRescue(raw: unknown): RescuePlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Json;

  const fixes: RescueAction[] = [];
  if (Array.isArray(record.fixes)) {
    for (const item of record.fixes) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Json;
      const action = {
        do: asString(entry.do).trim(),
        amount: asString(entry.amount).trim(),
        when: asString(entry.when).trim(),
        check: asString(entry.check).trim(),
      };
      if (action.do) {
        fixes.push({
          do: softenCommandLanguage(action.do),
          amount: action.amount,
          when: action.when,
          check: softenCommandLanguage(action.check),
        });
      }
    }
  }

  const insertNow = normalizeStepPatch(record.insertNow);
  const remaining: RescueStepPatch[] = [];
  if (Array.isArray(record.remaining)) {
    for (const item of record.remaining) {
      const patch = normalizeStepPatch(item);
      if (patch && !/^null$/i.test(patch.instruction)) remaining.push(patch);
    }
  }

  const diagnosis = softenCommandLanguage(asString(record.diagnosis)).trim();
  if (!diagnosis && !fixes.length && !insertNow && !remaining.length) return null;

  return {
    diagnosis: diagnosis || '这道菜现在的状态需要先做一步处理，再继续后面的步骤。',
    fixes,
    insertNow,
    remaining,
  };
}

/** 小猫话术的返回结构：一次要 3 句。 */
const BANTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: { type: 'string' },
    },
  },
} as const;

const BANTER_TAG_TEXT: Record<string, string> = {
  greet: '用户刚打开应用',
  click: '用户点了一下你',
  cooking: '用户正在做菜',
  night: '现在是深夜',
  done: '用户刚做完一餐',
};

/**
 * 小猫卖萌话术的系统提示词。
 *
 * 定位是「吉祥物」，不是助手：不给烹饪建议、不做健康判断，
 * 只负责暖场、打趣、陪伴。
 */
function banterPrompt(): string {
  return [
    '你是一只拿着锅铲的橘猫，是「知味咪」这个做饭应用的吉祥物。',
    '说话对象是正在做饭或准备做饭的人。',
    '',
    '要求：',
    '1. 每句 6~18 个汉字，口语，像真的猫在说话。',
    '2. 一半温柔体贴，一半俏皮打趣，不要全是鸡汤。',
    '3. 不要说教：禁止出现「建议」「应该」「必须」「一定要」。',
    '4. 不给烹饪步骤、不谈营养热量、不做健康判断。',
    '5. 不出现表情符号、括号说明、引号。',
    '6. 三句之间不要重复同一个梗。',
    '7. 输出 JSON：{"lines": ["...", "...", "..."]}',
  ].join('\n');
}

/** 调用模型生成几句卖萌话术。 */
async function callBanter(
  config: VoiceGatewayConfig,
  tag: string,
  context: { dishName?: string; stepIndex?: number },
): Promise<string[]> {
  const apiKey = config.apiKey ?? process.env.VOICE_API_KEY;
  const model = config.model ?? process.env.VOICE_MODEL ?? DEFAULT_MODEL;
  const baseUrl = (config.baseUrl ?? process.env.VOICE_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  if (!apiKey) throw new Error('服务端未配置 VOICE_API_KEY，请检查 .env');

  const scene = BANTER_TAG_TEXT[tag] ?? '用户点了一下你';
  const extra = context.dishName
    ? `当前菜名：${context.dishName}${typeof context.stepIndex === 'number' ? `，第 ${context.stepIndex + 1} 步` : ''}`
    : '';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: banterPrompt() },
        { role: 'user', content: [scene, extra].filter(Boolean).join('\n') },
      ],
      temperature: 0.95,
      enable_thinking: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'mascot_banter', strict: true, schema: BANTER_SCHEMA },
      },
    }),
  });
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const error =
      body.error && typeof body.error === 'object' ? (body.error as Json).message : undefined;
    throw new Error(typeof error === 'string' ? error : `话术生成失败（${response.status}）`);
  }
  const parsed = parseJsonLoose(extractText(body));
  return asStringArray(parsed.lines, 3);
}

/** 严格 JSON Schema：强制模型返回合法结构。 */
const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intents', 'answer', 'actions', 'memory', 'recommendQuery', 'rescue'],
  properties: {
    intents: {
      type: 'array',
      items: { type: 'string', enum: [...INTENTS] },
    },
    answer: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['do', 'amount', 'when', 'check'],
        properties: {
          do: { type: 'string' },
          amount: { type: 'string' },
          when: { type: 'string' },
          check: { type: 'string' },
        },
      },
    },
    memory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dimension', 'polarity', 'evidence'],
        properties: {
          dimension: { type: 'string', enum: [...DIMENSIONS] },
          polarity: { type: 'integer', minimum: -2, maximum: 2 },
          evidence: { type: 'string' },
        },
      },
    },
    recommendQuery: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['flavors', 'exclude'],
      properties: {
        flavors: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    // 抢救方案：用户报告菜出了问题、需要改写后续步骤时才有内容
    rescue: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['diagnosis', 'fixes'],
      properties: {
        diagnosis: { type: 'string' },
        fixes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['do', 'amount', 'when', 'check'],
            properties: {
              do: { type: 'string' },
              amount: { type: 'string' },
              when: { type: 'string' },
              check: { type: 'string' },
            },
          },
        },
        insertNow: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['instruction'],
          properties: {
            instruction: { type: 'string' },
            action: { type: 'string' },
            heat: { type: 'string' },
            durationSeconds: { type: ['number', 'null'] },
            check: { type: 'string' },
            tip: { type: 'string' },
          },
        },
        remaining: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['instruction'],
            properties: {
              instruction: { type: 'string' },
              action: { type: 'string' },
              heat: { type: 'string' },
              durationSeconds: { type: ['number', 'null'] },
              check: { type: 'string' },
              tip: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * 系统提示词。
 *
 * 重点解决「回答空泛」：强制结合当前菜谱的真实食材与用量给可执行动作，
 * 每条动作必须含「做什么 / 多少 / 什么时候 / 怎么判断」。
 */
function systemPrompt(): string {
  return [
    '你是「知味咪」厨房助手，正在陪用户做一道具体的菜。',
    '',
    '【回答要求｜最重要】',
    '1. 必须结合用户当前这道菜的**真实食材、真实用量、当前做到第几步**来回答。',
    '2. 严禁空泛建议。不允许只说"加盐""加点酱油""注意火候"这类没有量、没有时机的废话。',
    '3. 每条动作写清四件事：做什么（do）、用多少（amount）、什么时候做（when）、怎么判断做好了（check）。',
    '4. 用量优先引用这道菜现有食材的比例或用量；没有对应食材时，明确说明"家里若有…可加"。',
    '5. 如果用户的问题与当前这道菜无关，先用一句话说明，再回答通用问题。',
    '6. answer 控制在 4 句以内，直接说人话；不要出现字段名、JSON、英文 key，也不要写「flavors:」「exclude:」这类字样。',
    '7. actions 最多 3 条，只保留最关键的动作；纯粹推荐菜谱时 actions 可以为空。',
    '8. 涉及推荐时，answer 里严禁自己编造或罗列菜名 —— 菜名只能由系统从真实菜谱库检索后展示。',
    '   这种情况下 answer 只写一句引导语，例如「我给你从菜谱库里挑了几道辣的，看下面」。',
    '',
    '【语气｜硬性】',
    '只给建议，不下命令。禁止出现「必须」「一定要」「你应该」「立刻」「马上」等绝对表达。',
    '涉及继续加热、加盐、加油时，必须给出理由和可观察的判断标准，而不是下结论。',
    '不编造加热时间、核心温度等安全数值，只能复述菜谱里已有的数值。',
    '',
    '【意图 intents（可多选）】',
    '- remedy：用户说这道菜不对劲（太淡/太咸/太辣/糊了/夹生/水太多）或问怎么补救。',
    '- suggest：用户问下一步该怎么做、还有什么建议。',
    '- recommend：用户想要**推荐别的菜**（"推荐几道""来几个菜""有什么好吃的"）。',
    '- remember：用户主动陈述自己的口味偏好（"我喜欢辣""别放香菜"）。',
    '- ask：其它烹饪问题。',
    '',
    '【记忆 memory】',
    '只有用户**主动陈述偏好**才写 memory；只是描述当前这道菜（"这道菜有点淡"）时，memory 留空数组。',
    'dimension 只能取：' + DIMENSIONS.join(' / '),
    'polarity：-2 到 2 的整数，正数表示更喜欢/要更多，负数表示更少/不喜欢。',
    '',
    '【推荐 recommendQuery】',
    '当 intents 含 recommend 时，必须给出检索条件：',
    'flavors 填口味关键词（如 辣、甜、酸、清淡、汤、西餐、甜品），exclude 填用户忌口食材。',
    '不需要推荐时填 null。',
    '',
    '【抢救 rescue｜用户说菜出问题了才填】',
    '- 用户说太咸/太淡/太辣/糊了/夹生/水太多时，intents 必须含 remedy，并给出 rescue 对象。',
    '- 其它情况 rescue 填 null。',
    '- 必须先按「菜品形态」选对补救思路，不要一套话套所有菜：',
    '  · 汤菜／羹类：优先「加热水/淡汤稀释」「加食材吸味」「加少量糖圆味」，不能倒掉重做；',
    '  · 炒／烧类：优先「盛出部分汤汁」「补同款未调味食材」「加少量糖或醋平衡」，不要再加水；',
    '  · 炖／焖菜：可以「加水稀释后延长收汁」，注意延长会改变口感；',
    '  · 蒸菜：只能「补淋调味汁」或「换一碟蘸料」，不能在蒸笼里加水；',
    '  · 凉菜：优先「补糖醋/芝麻酱平衡」「加黄瓜丝等清淡配菜」，不能回锅；',
    '  · 主食面食：汤面可「兑汤」，拌面/炒饭可「加蛋或蔬菜」，不要加盐；',
    '  · 甜品烘焙：优先「加奶/糖/酸」平衡，不要加咸味调料；',
    '  · 西餐：按酱汁思路处理，可用奶油/高汤/柠檬调节。',
    '- dining context 里给了 dishKind、currentAction、remainingSteps，必须据此判断还能做什么；',
    '  已经收汁或装盘的菜，不要给「倒掉水重做」这类做不到的建议。',
    '- fixes 是现在马上做的动作（含用量与判断标准）。',
    '- insertNow：把 fixes 里**需要立刻动手**的那一步写成可执行步骤（instruction 要具体到量），',
    '  它会被插入到当前步骤之后、原后续步骤之前；只有完全没有可执行动作时才填 null。',
    '- remaining 是**改写后的后续步骤**：必须假设 insertNow 已经执行过，',
    '  保持原步骤的数量级与逻辑顺序，只调整受影响的步骤',
    '  （例如补了水就要加一步收汁）；若后续步骤完全不受影响，remaining 留空数组。',
    '- 时长只能沿用原步骤已有的数值或写合理区间，不要编造精确秒数；不得编造温度。',
    '- 抢救只针对口味与火候，不得为了「减咸」而删掉过敏原或忌口食材。',
    '',
    '【过敏忌口】',
    '忌口信息只能用于提醒，不得据此修改菜谱或删除食材。',
    '',
    '回答用中文，口语化，像在旁边帮忙的人，不要写成教科书。',
  ].join('\n');
}

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

function asStringArray(value: unknown, limit = 8): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

export type VoiceAction = { do: string; amount: string; when: string; check: string };

export type NormalizedReply = {
  intents: string[];
  answer: string;
  actions: VoiceAction[];
  memory: { dimension: string; polarity: number; source: 'explicit'; evidence: string }[];
  recommendQuery: { flavors: string[]; exclude: string[] } | null;
  /** 抢救方案：用户报告菜出问题时才有 */
  rescue: RescuePlan | null;
  /** 是否需要走本地推荐（意图命中，或用户原话明显在要推荐） */
  wantRecommend: boolean;
};

/** 口味维度 → 菜谱库口味关键词，用于从记忆推导检索条件。 */
const DIMENSION_FLAVOR: Record<string, { positive?: string[]; negative?: string[] }> = {
  spiciness: { positive: ['辣'], negative: ['清淡'] },
  sweetness: { positive: ['甜'] },
  sourness: { positive: ['酸'] },
  saltiness: { negative: ['清淡'] },
  greasiness: { negative: ['清淡'] },
  seasoning: { positive: ['咸鲜', '酱香'], negative: ['清淡'] },
};

/** 从用户原话 + 已生效记忆推导检索条件，作为模型没给 query 时的兜底。 */
export function deriveRecommendQuery(
  text: string,
  memories: { dimension: string; polarity: number }[] = [],
): { flavors: string[]; exclude: string[] } {
  const flavors = new Set<string>();
  const keywords = ['辣', '甜', '酸', '清淡', '汤', '西餐', '甜品', '面', '粥', '凉菜', '小吃'];
  for (const word of keywords) {
    if (text.includes(word)) flavors.add(word);
  }
  for (const memory of memories) {
    const mapping = DIMENSION_FLAVOR[memory.dimension];
    if (!mapping) continue;
    const bucket = memory.polarity > 0 ? mapping.positive : mapping.negative;
    for (const word of bucket ?? []) flavors.add(word);
  }
  return { flavors: Array.from(flavors), exclude: [] };
}

const RECOMMEND_HINT = /推荐|来几道|来几个|有什么(好吃|菜|选择)|换一道|换个菜/;

/** 校验并规整模型返回，同时补齐模型偷懒漏掉的字段。 */
export function normalizeChatResult(raw: Json, userText = ''): NormalizedReply {
  const rawIntents = asStringArray(raw.intents);
  const intents = rawIntents.filter((item): item is (typeof INTENTS)[number] =>
    (INTENTS as readonly string[]).includes(item),
  );

  const memory: NormalizedReply['memory'] = [];
  if (Array.isArray(raw.memory)) {
    for (const item of raw.memory) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Json;
      const dimension = asString(record.dimension);
      if (!(DIMENSIONS as readonly string[]).includes(dimension)) continue;
      const polarity = Number(record.polarity);
      if (!Number.isFinite(polarity) || polarity === 0) continue;
      memory.push({
        dimension,
        polarity: Math.max(-2, Math.min(2, Math.round(polarity))),
        source: 'explicit',
        evidence: asString(record.evidence, userText).slice(0, 80),
      });
    }
  }

  const actions: VoiceAction[] = [];
  if (Array.isArray(raw.actions)) {
    for (const item of raw.actions) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Json;
      const action = {
        do: asString(record.do).trim(),
        amount: asString(record.amount).trim(),
        when: asString(record.when).trim(),
        check: asString(record.check).trim(),
      };
      if (action.do) actions.push(action);
    }
  }

  const rescue = normalizeRescue(raw.rescue);

  let recommendQuery: NormalizedReply['recommendQuery'] = null;
  if (raw.recommendQuery && typeof raw.recommendQuery === 'object') {
    const query = raw.recommendQuery as Json;
    recommendQuery = {
      flavors: asStringArray(query.flavors, 6),
      exclude: asStringArray(query.exclude, 6),
    };
  }

  // 模型说"推荐"，或用户原话明显在要推荐，都强制走本地推荐
  const wantsRecommend =
    intents.includes('recommend') &&
    !intents.every((item) => item === 'recommend' || item === 'remember');
  const hinted = RECOMMEND_HINT.test(userText);
  const wantRecommend = intents.includes('recommend') || hinted;
  if (wantRecommend && !intents.includes('recommend')) intents.push('recommend');
  if (wantRecommend && !recommendQuery) {
    recommendQuery = deriveRecommendQuery(userText, memory);
  }

  const answer = cleanAnswer(softenCommandLanguage(asString(raw.answer, asString(raw.subtitle))));

  return {
    intents: intents.length ? intents : ['ask'],
    answer: answer || '我没太听清，你可以再说一次吗？',
    actions: actions.map((action) => ({
      do: softenCommandLanguage(action.do),
      amount: action.amount,
      when: action.when,
      check: softenCommandLanguage(action.check),
    })),
    memory,
    recommendQuery,
    rescue,
    wantRecommend: wantRecommend || wantsRecommend,
  };
}

async function callChatModel(
  config: VoiceGatewayConfig,
  messages: unknown[],
  userText: string,
): Promise<NormalizedReply> {
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      // 关闭思考模式：这是把 30 秒降到 2 秒的关键
      enable_thinking: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'voice_reply', strict: true, schema: REPLY_SCHEMA },
      },
    }),
  });
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const error =
      body.error && typeof body.error === 'object' ? (body.error as Json).message : undefined;
    const message = error ?? body.message;
    throw new Error(
      typeof message === 'string' ? message : `对话模型请求失败（${response.status}）`,
    );
  }
  return normalizeChatResult(parseJsonLoose(extractText(body)), userText);
}

/** 调用 DashScope 非实时语音识别（原生接口，非 OpenAI 兼容）。 */
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
  const base = (
    config.dashscopeBase ??
    process.env.VOICE_DASHSCOPE_BASE ??
    DEFAULT_DASHSCOPE_BASE
  ).replace(/\/$/, '');
  if (!apiKey) throw new Error('服务端未配置 VOICE_API_KEY，请检查 .env');

  const parameters: Json = { format };
  if (sampleRate) parameters.sample_rate = String(sampleRate);
  if (vocabulary && Object.keys(vocabulary).length) parameters.vocabulary = vocabulary;
  if (languageHints?.length) parameters.language_hints = languageHints.slice(0, 4);

  const response = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'disable',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  });
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const message =
      body.message ??
      (body.error && typeof body.error === 'object' ? (body.error as Json).message : undefined);
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

/** 把完整菜谱上下文拼成给模型看的文本 —— 这是回答是否具体的关键。 */
export function buildUserMessage(body: Json): string {
  const context = (body.context ?? {}) as Json;
  const lines: string[] = [];
  lines.push(`用户说：${asString(body.text)}`);

  const name = asString(context.recipeName);
  if (name) {
    const meta: string[] = [];
    const cuisines = asStringArray(context.cuisines, 4);
    if (cuisines.length) meta.push(`菜系 ${cuisines.join('/')}`);
    if (typeof context.servings === 'number') meta.push(`${context.servings} 人份`);
    if (typeof context.estimatedMinutes === 'number') meta.push(`约 ${context.estimatedMinutes} 分钟`);
    lines.push(`正在做的菜：${name}${meta.length ? `（${meta.join('，')}）` : ''}`);
  }

  // 菜品形态：决定补救思路（汤菜能稀释，干炒不能加水）
  if (context.dishKind) lines.push(`菜品形态：${asString(context.dishKind)}`);
  if (context.currentAction) lines.push(`当前步骤的动作：${asString(context.currentAction)}`);
  if (context.currentHeat) lines.push(`当前步骤的火候：${asString(context.currentHeat)}`);
  if (typeof context.currentDurationSeconds === 'number') {
    lines.push(`当前步骤原本的时长：${Math.round(context.currentDurationSeconds)} 秒`);
  }

  const remaining = Array.isArray(context.remainingSteps) ? context.remainingSteps : [];
  if (remaining.length) {
    lines.push('当前步骤之后的剩余步骤（改写时以此为基准，不要凭空增删与原流程无关的步骤）：');
    for (const item of remaining) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Json;
      const extra = [
        asString(record.action) && `动作 ${asString(record.action)}`,
        asString(record.heat) && `火候 ${asString(record.heat)}`,
        typeof record.durationSeconds === 'number' && `约 ${Math.round(record.durationSeconds)} 秒`,
        asString(record.check) && `判断 ${asString(record.check)}`,
      ].filter(Boolean);
      lines.push(
        `  第 ${record.order ?? '?'} 步：${asString(record.instruction)}${extra.length ? `（${extra.join('；')}）` : ''}`,
      );
    }
  }

  const ingredients = Array.isArray(context.ingredients) ? context.ingredients : [];
  if (ingredients.length) {
    const text = ingredients
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const record = item as Json;
        const amount = asString(record.amount);
        const group = asString(record.group);
        return `${asString(record.name)}${amount ? ` ${amount}` : ''}${group ? `〔${group}〕` : ''}`;
      })
      .filter(Boolean)
      .join('、');
    lines.push(`这道菜的全部食材与用量：${text}`);
  }

  const steps = asStringArray(context.steps, 20);
  if (steps.length) {
    lines.push('完整步骤：');
    steps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
  }

  if (typeof context.stepIndex === 'number') {
    const total = typeof context.stepTotal === 'number' ? `（共 ${context.stepTotal} 步）` : '';
    lines.push(`用户现在进行到：第 ${context.stepIndex + 1} 步${total}`);
  }
  if (context.stepInstruction) lines.push(`当前这一步的原文：${asString(context.stepInstruction)}`);
  if (context.check) lines.push(`这一步的判断标准：${asString(context.check)}`);
  if (context.tip) lines.push(`这一步的技巧：${asString(context.tip)}`);
  if (context.recipeTips) lines.push(`整道菜的小窍门：${asString(context.recipeTips)}`);
  if (context.description) lines.push(`菜品简介：${asString(context.description).slice(0, 200)}`);

  const remedyList = context.remedies;
  if (remedyList && typeof remedyList === 'object') {
    lines.push(
      `本地补救方案（可引用，但请结合这道菜说具体）：${JSON.stringify(remedyList).slice(0, 500)}`,
    );
  }

  const memories = asStringArray(context.tastePreferences, 8);
  if (memories.length) lines.push(`用户已记录的口味偏好：${memories.join('、')}`);
  const avoid = asStringArray(context.avoidIngredients, 8);
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
        const languageHints = asStringArray(body.languageHints, 4);
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
        const result = await callChatModel(
          config,
          [
            { role: 'system', content: systemPrompt() },
            { role: 'user', content: buildUserMessage(body) },
          ],
          text,
        );
        res.end(JSON.stringify(result));
        return;
      }

      if (req.url === '/api/voice/banter') {
        const tag = asString(body.tag, 'click');
        const lines = await callBanter(config, tag, {
          dishName: asString(body.dishName) || undefined,
          stepIndex: typeof body.stepIndex === 'number' ? body.stepIndex : undefined,
        });
        res.end(JSON.stringify({ lines }));
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

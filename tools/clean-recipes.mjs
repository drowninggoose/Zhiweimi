import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(root, 'public/recipes-library.json');
const reportPath = resolve(root, 'docs/recipe-cleaning-report.json');

const ACTIONS = [
  '切',
  '洗',
  '泡',
  '腌',
  '焯',
  '煮',
  '炖',
  '蒸',
  '炒',
  '煎',
  '炸',
  '烤',
  '拌',
  '搅',
  '打',
  '倒',
  '放',
  '加入',
  '撒',
  '淋',
  '翻',
  '收汁',
  '烧',
  '烫',
  '去皮',
  '去核',
  '压',
  '擀',
  '包',
  '备',
  '取',
  '捞',
  '沥',
  '撕',
  '剁',
  '磨',
  '挤',
  '摆',
  '盖',
  '刷',
  '揉',
  '醒',
  '发酵',
  '冷藏',
  '冷却',
  '焖',
  '兑',
  '铺',
  '卷',
  '浇',
  '冲',
  '撇',
  '码',
  '盛',
];
const COOKING_ACTIONS = ['焯', '煮', '炖', '蒸', '炒', '煎', '炸', '烤', '烧', '收汁', '加热'];
const OBJECTIVE_STATES = [
  '沸腾',
  '烧开',
  '煮开',
  '金黄',
  '微黄',
  '焦黄',
  '变色',
  '断生',
  '熟透',
  '六分熟',
  '七分熟',
  '八分熟',
  '软烂',
  '透明',
  '凝固',
  '融化',
  '收干',
  '浓稠',
  '无血水',
  '浮起',
  '膨胀',
  '脱骨',
  '起泡',
  '出油',
  '入味',
  '炒香',
];
const SUBJECTIVE_ONLY =
  /^(装盘|盛出|出锅|开吃|完成|可以吃了|成品|简单美味|非常好吃|味道不错)[。！!，,]*$/;
const FORBIDDEN_VAGUE = /随便|差不多|一会儿|片刻|看着办|凭感觉|若干|大约一会|火不要太大/;
const REVIEW_WORDS =
  /简单美味|美味简单|非常美味|特别美味|超级好吃|非常好吃|太好吃|香喷喷|真香|绝绝子|值得一试|孩子能连吃|开吃/;
const PERSONAL_WORDS =
  /根据个人口味|按(?:个人)?口味|依个人口味|可按喜好|喜欢(?:吃|辣|甜|酸|咸)?的?可|不喜欢|口味重|口味淡/;
const VAGUE_AMOUNT =
  /^(适量|少许|一点|若干|几颗|几片|几根|一盘|半盘|大半锅|小半锅|随意|酌情|按需)$/;
const SEASONINGS =
  /盐|糖|胡椒|辣椒|辣椒粉|孜然|花椒|味精|鸡精|生抽|老抽|酱油|醋|蚝油|耗油|料酒|香油|芝麻油|葱|姜|蒜|香菜|芝麻|油$/;
const SEASONING_BASELINES = [
  [/清水|水量|葱姜水/, 100],
  [/啤酒|料酒|黄酒/, 10],
  [/食用油|玉米油|色拉油|猪油|香油|芝麻油|辣椒油|油$/, 10],
  [/生抽|老抽|酱油|蚝油/, 10],
  [/陈醋|白醋|香醋|醋$/, 10],
  [/淀粉水/, 20],
  [/盐/, 2],
  [/白糖|冰糖|红糖|糖$/, 5],
  [/鸡精|味精/, 1],
  [/胡椒|花椒|孜然|大料|八角|辣椒粉/, 1],
  [/葱|姜|蒜|香菜|芝麻|枸杞|干辣椒|洋葱/, 5],
];

const chineseDigits = new Map([
  ['半', 0.5],
  ['一', 1],
  ['二', 2],
  ['两', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['七', 7],
  ['八', 8],
  ['九', 9],
  ['十', 10],
]);

function cleanText(value = '') {
  return String(value)
    .replace(/耗油/g, '蚝油')
    .replace(/旺火|猛火|武火/g, '大火')
    .replace(/文火|最小火|微火/g, '小火')
    .replace(/中小火/g, '小火')
    .replace(/中大火/g, '中火')
    .replace(/\s+/g, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。！!]{2,}/g, '。')
    .replace(/^[，。；;]+|[，；;]+$/g, '')
    .trim();
}

function parseNumber(raw) {
  const arabic = Number(raw);
  if (Number.isFinite(arabic)) return arabic;
  return chineseDigits.get(raw);
}

function parseAmount(rawAmount, ingredientName) {
  const raw = cleanText(rawAmount);
  if (!raw) return null;
  if (VAGUE_AMOUNT.test(raw)) {
    if (SEASONINGS.test(ingredientName)) return { amount: '根据个人口味调整' };
    return null;
  }
  const matches = [
    ...raw.matchAll(
      /(\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十)\s*(千克|公斤|kg|斤|克|g|毫升|ml|升|L|个|只|颗|片|根|张|瓣|勺|匙|碗|杯|条|块|朵|把|小把|大把|包|袋|罐|盒|节|段|头|粒|枚|份)/gi,
    ),
  ];
  if (!matches.length) return null;
  // “一条500克”优先采用可换算的质量/容量数据。
  const chosen = matches.find((m) => /千克|公斤|kg|斤|克|g|毫升|ml|升|L/i.test(m[2])) ?? matches[0];
  let amount = parseNumber(chosen[1]);
  if (amount === undefined) return null;
  let unit = chosen[2].toLowerCase();
  if (unit === '千克' || unit === '公斤' || unit === 'kg') {
    amount *= 1000;
    unit = 'g';
  } else if (unit === '斤') {
    amount *= 500;
    unit = 'g';
  } else if (unit === '克') unit = 'g';
  else if (unit === '毫升') unit = 'ml';
  else if (unit === '升' || unit === 'l') {
    amount *= 1000;
    unit = 'ml';
  }
  return { amount, unit, note: raw === chosen[0] ? undefined : `原始用量：${raw}` };
}

function seasoningAmount(name, rawAmount, parsed) {
  if (parsed?.unit === 'g') {
    return {
      ...parsed,
      note: [parsed.note, '基准用量，可根据个人口味调整'].filter(Boolean).join('；'),
    };
  }
  if (parsed?.unit === 'ml') {
    return {
      amount: Number(parsed.amount),
      unit: 'g',
      note: `按液体近似密度换算；可根据个人口味调整${rawAmount ? `；原始用量：${rawAmount}` : ''}`,
    };
  }
  const amount = SEASONING_BASELINES.find(([pattern]) => pattern.test(name))?.[1] ?? 5;
  return {
    amount,
    unit: 'g',
    note: `家庭烹饪基准用量，可根据个人口味调整${rawAmount ? `；原始用量：${rawAmount}` : ''}`,
  };
}

function durationSeconds(text) {
  const match = text.match(
    /(\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十)\s*(小时|分钟|分|秒)/,
  );
  if (!match) return undefined;
  const value = parseNumber(match[1]);
  if (value === undefined) return undefined;
  return Math.round(value * (match[2] === '小时' ? 3600 : match[2] === '秒' ? 1 : 60));
}

function detectHeat(text) {
  return text.match(/大火|中火|小火/)?.[0];
}

function detectUtensil(text) {
  return text.match(
    /蒸锅|炒锅|平底锅|汤锅|砂锅|高压锅|电饭煲|烤箱|空气炸锅|微波炉|料理机|搅拌机|碗|盆|盘/,
  )?.[0];
}

function detectAction(text) {
  return ACTIONS.find((action) => text.includes(action));
}

function detectCheck(text) {
  const explicit = text.match(/(?:直至|直到|至|待)([^，。；]{2,24})/);
  if (explicit) return explicit[1];
  return OBJECTIVE_STATES.find((state) => text.includes(state));
}

function defaultCheck(action) {
  if (/焯|烫/.test(action)) return '食材变色且断生';
  if (/炒/.test(action)) return '食材受热均匀';
  if (/煎|炸|烤/.test(action)) return '食材表面颜色均匀';
  if (/煮|炖|蒸|烧|焖/.test(action)) return '食材熟透';
  if (/收汁/.test(action)) return '汤汁浓稠';
  return undefined;
}

function sanitizeInstruction(value) {
  let text = cleanText(value);
  if (!text || SUBJECTIVE_ONLY.test(text) || FORBIDDEN_VAGUE.test(text)) return null;
  const personalization = PERSONAL_WORDS.test(text) ? '可根据个人口味调整调味料用量' : undefined;
  const clauses = text
    .split(/[。！？!]/)
    .filter(Boolean)
    .filter((clause) => {
      if (REVIEW_WORDS.test(clause)) return false;
      if (/^(我|我们|俺|本人|家里|我家|小孩|孩子|老公|老婆)/.test(clause)) return false;
      return true;
    });
  text = clauses
    .join('；')
    .replace(
      /[^，；。]*(?:简单美味|美味简单|非常美味|特别美味|超级好吃|非常好吃|太好吃|香喷喷|蛋香满满|很好吃)[^，；。]*[，；。]?/g,
      '',
    )
    .replace(/[^，；。]*(?:想吃|喜欢吃|不喜欢|控糖人士)[^，；。]*[，；。]?/g, '')
    .replace(/喜欢的?可以试试|喜欢的?试试|吃起来[^；。]*|味道[^；。]*(?:好|棒|香)/g, '')
    .replace(/[；]{2,}/g, '；')
    .replace(/^[；，]+|[；，]+$/g, '');
  if (!text || text.length < 5 || SUBJECTIVE_ONLY.test(text)) return null;
  if (!/[。；]$/.test(text)) text += '。';
  return { text, personalization };
}

function cleanStep(step, order) {
  const cleaned = sanitizeInstruction(step.instruction);
  if (!cleaned) return null;
  const action = detectAction(cleaned.text);
  if (!action) return null;
  let heat = detectHeat(cleaned.text);
  const duration = durationSeconds(cleaned.text);
  const check = detectCheck(cleaned.text) ?? defaultCheck(action);
  const isCooking = COOKING_ACTIONS.some((word) => cleaned.text.includes(word));
  // 核心加热步骤至少要有火力，且要有时长或可观察终点；不凭空补数据。
  // 原文已有明确时长或客观终点但漏写火力时，统一采用家庭烹饪的中火基准。
  if (isCooking && !heat) heat = '中火';
  return {
    order,
    instruction: cleaned.text,
    action,
    utensil: detectUtensil(cleaned.text),
    heat,
    durationSeconds: duration,
    check,
    personalization: cleaned.personalization,
  };
}

function addMeasuredAmountsToStep(step, ingredients) {
  let instruction = step.instruction;
  for (const ingredient of ingredients) {
    if (
      typeof ingredient.normalizedAmount !== 'number' ||
      !['g', 'ml'].includes(ingredient.normalizedUnit) ||
      !instruction.includes(ingredient.name)
    )
      continue;
    const escaped = ingredient.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const unit = ingredient.normalizedUnit === 'g' ? '克' : '毫升';
    const measured = `${ingredient.normalizedAmount}${unit}${ingredient.name}`;
    instruction = instruction
      .replace(new RegExp(`(?:适量|少许|一点)(?:的)?${escaped}`, 'g'), measured)
      .replace(new RegExp(`${escaped}(?:适量|少许|一点)`, 'g'), measured);
    const anyUnit = '(?:克|g|毫升|ml|个|只|颗|粒|片|根|张|瓣|勺|匙|碗|杯|条|块|朵|把)';
    const anyNumber = '(?:\\d+(?:\\.\\d+)?|半|一|二|两|三|四|五|六|七|八|九|十)';
    const alreadyMeasured =
      new RegExp(`${escaped}\\s*${anyNumber}\\s*${anyUnit}`, 'i').test(instruction) ||
      new RegExp(`${anyNumber}\\s*${anyUnit}\\s*${escaped}`, 'i').test(instruction);
    if (!alreadyMeasured) instruction = instruction.replace(new RegExp(escaped, 'g'), measured);
  }
  return { ...step, instruction };
}

function cleanRecipe(recipe) {
  if (!recipe.name || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps))
    return { reason: '字段缺失' };
  const ingredients = [];
  for (const item of recipe.ingredients) {
    const name = cleanText(item.name);
    const originalAmount = cleanText(item.amount);
    const parsed = parseAmount(originalAmount, name);
    const isSeasoning = item.group === '调料' || SEASONINGS.test(name);
    if (!name) return { reason: '关键食材用量无法量化' };
    if (!parsed && item.group === '主料') return { reason: '关键食材用量无法量化' };
    const normalized = isSeasoning
      ? seasoningAmount(name, originalAmount, parsed)
      : (parsed ?? { amount: originalAmount });
    ingredients.push({
      name,
      amount: originalAmount || (isSeasoning ? '适量' : ''),
      normalizedAmount: normalized.amount,
      normalizedUnit: normalized.unit,
      normalizationNote: normalized.note,
      group: item.group,
    });
  }
  if (ingredients.length < 2) return { reason: '食材不足' };
  if (
    !ingredients.some(
      (item) =>
        item.group !== '调料' &&
        typeof item.normalizedAmount === 'number' &&
        (item.normalizedUnit === 'g' || item.normalizedUnit === 'ml'),
    )
  )
    return { reason: '缺少可进行家庭厨具换算的核心食材' };
  const steps = [];
  for (const rawStep of recipe.steps) {
    const step = cleanStep(rawStep, steps.length + 1);
    if (!step) {
      // 纯装盘/开吃步骤可以删除；包含实际操作但无法结构化则整道菜删除。
      if (SUBJECTIVE_ONLY.test(cleanText(rawStep.instruction))) continue;
      return { reason: '步骤缺少动作、火力、时长或客观终点' };
    }
    steps.push(addMeasuredAmountsToStep(step, ingredients));
  }
  if (
    steps.length < 2 ||
    !steps.some((s) => COOKING_ACTIONS.some((a) => s.instruction.includes(a)))
  )
    return { reason: '有效烹饪步骤不足' };
  // 简介普遍混有作者经历、营养宣传和口感评价；结构化烹饪不依赖简介，统一清空。
  const description = '';
  const tips = cleanText(recipe.tips)
    .split(/[。！？!]/)
    .filter((s) => s && !REVIEW_WORDS.test(s) && !/我|我们|我家|喜欢的?试试/.test(s))
    .join('；');
  return {
    recipe: {
      ...recipe,
      description,
      ingredients,
      steps,
      tips,
      dataStandard: 'structured-v4',
    },
  };
}

const source = JSON.parse(await readFile(inputPath, 'utf8'));
const kept = [];
const removed = [];
const reasons = {};
for (const recipe of source.recipes ?? []) {
  const result = cleanRecipe(recipe);
  if (result.recipe) kept.push(result.recipe);
  else {
    const reason = result.reason ?? '未知原因';
    removed.push({ id: recipe.id, name: recipe.name, reason });
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
}

const output = {
  schemaVersion: 2,
  cleaningStandard: 'structured-v4',
  generatedAt: new Date().toISOString(),
  template:
    '将【食材及用量】进行【预处理】，放入【器具】；加入【配料及用量】，使用【大火/中火/小火】进行【烹饪动作】【明确时长】，直至【客观完成状态】；【可选的个人口味调整】。',
  recipes: kept,
};
const report = {
  generatedAt: output.generatedAt,
  before: (source.recipes ?? []).length,
  after: kept.length,
  removed: removed.length,
  reasons,
  removedRecipes: removed,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(inputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    { before: report.before, after: report.after, removed: report.removed, reasons },
    null,
    2,
  ),
);

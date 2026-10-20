/**
 * 小猫说话的服务层。
 *
 * 设计要点：
 * - **轮换制**：记录已说过的句子，用完一轮才重置，避免纯随机导致的频繁重复；
 * - **必换句**：抽到的句子如果和上一句相同，会重抽；
 * - **AI 增强（可选）**：后台向本地网关要几句新鲜话术，过滤后存进本地池，
 *   之后优先从池里取；断网、无 Key、超时都不影响主流程（退化为纯语料）。
 */
import { linesForTag, MASCOT_TAGS, type MascotLine, type MascotTag } from '../content/mascotLines';

export type { MascotLine, MascotTag } from '../content/mascotLines';

const USED_KEY = 'zhiweimi:mascot-used';
const LAST_KEY = 'zhiweimi:mascot-last';
const POOL_KEY = 'zhiweimi:mascot-ai-pool';
const GREETED_KEY = 'zhiweimi:mascot-greeted';

/** AI 生成的句子最多存多少条，超出淘汰最旧的。 */
const POOL_LIMIT = 50;
/** 句子长度约束：太短没信息量，太长气泡放不下。 */
const MIN_LENGTH = 4;
const MAX_LENGTH = 20;

/** 说教腔与不合适的表达，AI 生成的一律丢弃。 */
const BANNED_PATTERNS = [
  /建议/,
  /应该/,
  /必须/,
  /一定要/,
  /最好还是/,
  /热量/,
  /卡路里/,
  /减肥/,
  /营养/,
  /治疗/,
  /生病/,
  /药/,
];

type UsedMap = Partial<Record<MascotTag, string[]>>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用就退化为纯随机，不影响功能
  }
}

function readUsed(): UsedMap {
  return readJson<UsedMap>(USED_KEY, {});
}

function markUsed(tag: MascotTag, id: string) {
  const used = readUsed();
  const list = used[tag] ?? [];
  if (!list.includes(id)) list.push(id);
  used[tag] = list;
  writeJson(USED_KEY, used);
}

function fullTagOf(id: string) {
  return id.split('-')[0] as MascotTag;
}

/** 某场景里还没说过的句子；全都说过时重置这个场景。 */
function availableLines(tag: MascotTag): MascotLine[] {
  const all = linesForTag(tag);
  const usedSet = new Set(readUsed()[tag] ?? []);
  const fresh = all.filter((line) => !usedSet.has(line.id));
  if (fresh.length) return fresh;
  // 一轮说完，重置该场景
  const used = readUsed();
  used[tag] = [];
  writeJson(USED_KEY, used);
  return all;
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export type PickOptions = {
  /**
   * 场景：给多个时在这些场景的并集里抽，
   * 例如做菜时说「烹饪中 + 通用点击」两种话，避免单调。
   */
  tag: MascotTag | MascotTag[];
  /** 上一句 id，保证不会连着说同一句 */
  avoidId?: string;
  /** 是否优先使用 AI 生成的话术池 */
  preferAi?: boolean;
};

/**
 * 取一句要说的话。
 *
 * 优先顺序：AI 池（若允许）→ 本场景未说过的语料；
 * 都会避开 `avoidId`，确保「每次必换」。
 */
export function pickLine({ tag, avoidId, preferAi = true }: PickOptions): MascotLine {
  const tags = Array.isArray(tag) ? tag : [tag];
  if (preferAi) {
    for (const item of tags) {
      const ai = takeFromPool(item, avoidId);
      if (ai) return ai;
    }
  }

  const candidates = tags
    .flatMap((item) => availableLines(item))
    .filter((line) => line.id !== avoidId);
  // 极端情况：这些场景只剩一句且正好是上一句，仍然要给它（宁可重复也不空着）
  const pool = candidates.length ? candidates : tags.flatMap((item) => linesForTag(item));
  const chosen = pickRandom(pool);
  markUsed(chosen.tag, chosen.id);
  rememberLast(chosen.id);
  return chosen;
}

/** 只从 AI 池里取一句（不消耗语料），供气泡即时替换使用。 */
export function takeAiLine(tag: MascotTag, avoidId?: string): MascotLine | null {
  return takeFromPool(tag, avoidId);
}

function rememberLast(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // 忽略
  }
}

export function lastLineId(): string | undefined {
  try {
    return localStorage.getItem(LAST_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * AI 话术池
 * ------------------------------------------------------------------ */

type PoolItem = { id: string; tag: MascotTag; text: string };

function readPool(): PoolItem[] {
  return readJson<PoolItem[]>(POOL_KEY, []);
}

function writePool(list: PoolItem[]) {
  writeJson(POOL_KEY, list.slice(-POOL_LIMIT));
}

/** 从池里取一条对应场景的句子；取走即移除，避免重复。 */
function takeFromPool(tag: MascotTag, avoidId?: string): MascotLine | null {
  const pool = readPool();
  const index = pool.findIndex((item) => item.tag === tag && item.id !== avoidId);
  if (index < 0) return null;
  const [item] = pool.splice(index, 1);
  writePool(pool);
  rememberLast(item.id);
  return { id: item.id, tag: item.tag, tone: 'warm', text: item.text };
}

/** 判断一句 AI 话术是否可以入库。 */
export function isAcceptableBanter(text: string): boolean {
  const value = text.trim();
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return false;
  if (BANNED_PATTERNS.some((pattern) => pattern.test(value))) return false;
  // 只允许中文、数字与常见标点，避免模型输出奇怪符号
  if (!/^[\u4e00-\u9fa5\d，。、！？…“”‘’：；\s]+$/.test(value)) return false;
  return true;
}

/** 把模型返回的句子过滤后写入本地池，返回入库条数。 */
export function storeBanter(tag: MascotTag, texts: string[]): number {
  const pool = readPool();
  const existing = new Set(pool.map((item) => item.text));
  const corpus = new Set(linesForTag(tag).map((line) => line.text));
  let added = 0;
  for (const raw of texts) {
    const text = raw.trim();
    if (!isAcceptableBanter(text)) continue;
    if (existing.has(text) || corpus.has(text)) continue;
    pool.push({ id: `ai-${Date.now()}-${added}`, tag, text });
    existing.add(text);
    added += 1;
  }
  if (added) writePool(pool);
  return added;
}

/** 从本地网关要几句新鲜话术；失败一律静默（退化为纯语料）。 */
export async function requestBanter(
  tag: MascotTag,
  context: { dishName?: string; stepIndex?: number } = {},
): Promise<number> {
  try {
    const response = await fetch('/api/voice/banter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, ...context }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return 0;
    const body = (await response.json()) as { lines?: string[] };
    const lines = body.lines ?? [];
    return storeBanter(tag, lines);
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ *
 * 场景判断与首屏问候
 * ------------------------------------------------------------------ */

/** 按小时给出时段场景，比笼统的「点击」更贴当时的语境。 */
export function timeTagOf(now = new Date()): MascotTag {
  const hour = now.getHours();
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * 推断当前该说哪一类话，优先级从高到低：
 * 刚做完一餐 → 做菜中 → 当前时段。
 */
export function resolveTag(
  now = new Date(),
  context: { cooking?: boolean; finished?: boolean } = {},
): MascotTag {
  if (context.finished) return 'done';
  if (context.cooking) return 'cooking';
  return timeTagOf(now);
}

/** 首屏问候语：同一会话只说一次。 */
export function takeGreeting(): MascotLine | null {
  try {
    if (sessionStorage.getItem(GREETED_KEY)) return null;
    sessionStorage.setItem(GREETED_KEY, '1');
  } catch {
    // 无法记录就不限制
  }
  return pickLine({ tag: 'greet', avoidId: lastLineId() });
}

/** 重置所有本地状态，主要给测试用。 */
export function resetMascotState() {
  for (const tag of MASCOT_TAGS) void tag;
  try {
    localStorage.removeItem(USED_KEY);
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(POOL_KEY);
    sessionStorage.removeItem(GREETED_KEY);
  } catch {
    // 忽略
  }
}

/** 供测试与调试：查看某个场景已用多少句。 */
export function usedCount(tag: MascotTag): number {
  return (readUsed()[tag] ?? []).length;
}

/** 供测试：直接往池里塞句子。 */
export function seedPool(tag: MascotTag, texts: string[]) {
  storeBanter(tag, texts);
}

/** 供界面显示：池里还有多少 AI 句子。 */
export function poolSize(tag: MascotTag): number {
  return readPool().filter((item) => item.tag === tag).length;
}

export { fullTagOf };

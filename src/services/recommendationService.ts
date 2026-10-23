/**
 * 「今日推荐」引擎。
 *
 * 三个目标：
 * 1. 像刷小红书 / 短视频一样：每次打开、每次点刷新，都给出不一样的一组菜；
 * 2. 按时间自动切换餐次：9 点前推早餐，9:00–14:00 推午餐，14:00 之后推晚餐；
 * 3. 午餐 / 晚餐不只推主菜，还搭配汤羹、甜品烘焙、西餐、凉菜等。
 *
 * 随机数全部来自可复现的种子随机（seed），所以同一批推荐在刷新前一直稳定，
 * 换批时只需要换一个种子。
 */
import {
  meals,
  mealLabels,
  type MealType,
  type PantryItem,
  type PlanConditions,
  type Recipe,
  type RecipeIngredient,
} from '../types/models';

export type MealWindowKey = MealType;

const HOUR = 60 * 60 * 1000;

/** 时间段划分：< 9:00 早餐；9:00–14:00 午餐；>= 14:00 晚餐。 */
export const MEAL_WINDOW_HOURS: { key: MealWindowKey; startHour: number; label: string }[] = [
  { key: 'breakfast', startHour: 0, label: '早餐时间' },
  { key: 'lunch', startHour: 9, label: '午餐时间' },
  { key: 'dinner', startHour: 14, label: '晚餐时间' },
];

/** 时间段 id，例如 2026-02-14-breakfast；同一时段内推荐可复现。 */
export function windowId(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}-${windowMeal(date)}`;
}

/** 当前时间属于哪一餐。 */
export function windowMeal(date: Date = new Date()): MealWindowKey {
  const hour = date.getHours();
  if (hour < 9) return 'breakfast';
  if (hour < 14) return 'lunch';
  return 'dinner';
}

export function windowDateInfo(date: Date = new Date()) {
  const meal = windowMeal(date);
  const window = MEAL_WINDOW_HOURS.find((w) => w.key === meal)!;
  const endHour = meal === 'breakfast' ? 9 : meal === 'lunch' ? 14 : 24;
  const countdownMs =
    (endHour - date.getHours() - 1) * HOUR +
    (59 - date.getMinutes()) * 60_000 +
    (59 - date.getSeconds()) * 1000;
  return {
    meal,
    mealLabel: mealLabels[meal],
    windowLabel: window.label,
    windowRange: `${String(window.startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`,
    countdownMs: Math.max(0, countdownMs),
    windowId: windowId(date),
  };
}

/** 距离下一次换时段还有多久，用于界面显示。 */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours <= 0 && minutes <= 0) return '不到 1 分钟';
  if (hours <= 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

/* ------------------------------------------------------------------ *
 * 可复现的种子随机
 * ------------------------------------------------------------------ */

/** cyrb128 + sfc32：小巧、快速、可复现的伪随机数发生器。 */
export function seededRandom(seed: string): () => number {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  let a = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  let b = (h2 ^ h1) >>> 0;
  let c = (h3 ^ h1) >>> 0;
  let d = (h4 ^ h1) >>> 0;
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * 候选菜与打分
 * ------------------------------------------------------------------ */

/** 菜谱的「正统餐次」：9 点后不该把甜品 / 烘焙当主菜推出来。 */
export function canonicalMeal(recipe: Recipe, meal: MealWindowKey): MealType {
  if (recipe.mealTypes.includes(meal)) return meal;
  const other = meals.find((m) => recipe.mealTypes.includes(m));
  return other ?? meal;
}

function matchesAvoid(recipe: Recipe, avoid: string[]) {
  return avoid.some((a) => a.trim() && recipe.ingredients.some((i) => i.name.includes(a.trim())));
}

/** 基础过滤。忌口不做硬过滤，只在后续打分时降低出现频率。 */
export function filterByConditions(recipes: Recipe[], conditions: PlanConditions): Recipe[] {
  return recipes.filter(
    (r) =>
      r.status === 'published' &&
      (!conditions.maxMinutes || (r.estimatedMinutes ?? Infinity) <= conditions.maxMinutes) &&
      (!conditions.difficulty || r.difficulty === conditions.difficulty),
  );
}

export function pantryScore(recipe: Recipe, pantry: PantryItem[]): number {
  return pantry.filter(
    (p) => p.status === 'available' && recipe.ingredients.some((i) => i.name.includes(p.name)),
  ).length;
}

function flavorScore(recipe: Recipe, flavors: string[]) {
  if (!flavors.length) return 0;
  return flavors.some((f) => recipe.flavorTags.includes(f)) ? 1 : 0;
}

/* ------------------------------------------------------------------ *
 * 推荐分组（早 / 午 / 晚各一套）
 * ------------------------------------------------------------------ */

export type RecommendationSlot = 'main' | 'soup' | 'dessert' | 'light' | 'western' | 'breakfast';

export type RecommendationBlock = {
  slot: RecommendationSlot;
  label: string;
  size: number;
  /** 该分组的候选取法，按顺序尝试，取到第一批非空结果为止。 */
  picks: ((recipe: Recipe) => boolean)[];
  /** 已在前面的分组里出现过的菜不再重复取（例如汤羹不要同时占主菜位）。 */
  distinctFrom?: RecommendationSlot[];
  /** 取不到菜时的兜底文案。 */
  fallback?: string;
};

/** 汤羹 / 粥这类更适合当配角，不占主菜位。 */
const isSoupLike = (r: Recipe) => r.cuisines.some((c) => c === '汤羹' || c === '粥');

export const BREAKFAST_BLOCKS: RecommendationBlock[] = [
  {
    slot: 'main',
    label: '今日主食',
    size: 2,
    picks: [
      (r) => r.mealTypes.includes('breakfast') && !isSoupLike(r),
      (r) =>
        r.cuisines.some((c) => ['早餐', '主食', '面食', '饼', '包子', '饺子'].includes(c)) &&
        !isSoupLike(r),
    ],
  },
  {
    slot: 'soup',
    label: '暖胃汤粥',
    size: 1,
    distinctFrom: ['main'],
    picks: [(r) => r.cuisines.some((c) => ['汤羹', '粥'].includes(c)), () => true],
    fallback: '今天没有汤粥类菜谱，先来份主食吧。',
  },
  {
    slot: 'light',
    label: '清爽小点',
    size: 1,
    distinctFrom: ['main', 'soup'],
    picks: [
      (r) => r.cuisines.some((c) => ['凉菜', '小吃', '饮品', '自制食材'].includes(c)),
      (r) => r.flavorTags.some((f) => ['清淡', '原味'].includes(f)),
    ],
    fallback: '没有合适的清爽小点。',
  },
];

export const LUNCH_BLOCKS: RecommendationBlock[] = [
  {
    slot: 'main',
    label: '今日主菜',
    size: 2,
    picks: [
      (r) => r.cuisines.some((c) => ['热菜', '凉菜', '家常菜'].includes(c)) && !isSoupLike(r),
      (r) => r.cuisines.some((c) => ['主食', '面食'].includes(c)),
    ],
  },
  {
    slot: 'soup',
    label: '配一碗汤',
    size: 1,
    distinctFrom: ['main'],
    picks: [(r) => r.cuisines.includes('汤羹')],
    fallback: '今天没有汤羹类菜谱，可以配个凉菜解腻。',
  },
  {
    slot: 'light',
    label: '解腻凉菜',
    size: 1,
    distinctFrom: ['main', 'soup'],
    picks: [
      (r) => r.cuisines.includes('凉菜'),
      (r) => r.cuisines.some((c) => ['小吃', '自制食材'].includes(c)),
    ],
    fallback: '没有更多凉菜类菜谱。',
  },
  {
    slot: 'dessert',
    label: '饭后甜点',
    size: 1,
    distinctFrom: ['main', 'soup'],
    picks: [(r) => r.cuisines.some((c) => ['甜品', '烘焙', '甜点', '饮品'].includes(c))],
    fallback: '今天没有甜品烘焙类菜谱。',
  },
];

export const DINNER_BLOCKS: RecommendationBlock[] = [
  {
    slot: 'main',
    label: '今晚主菜',
    size: 2,
    picks: [
      (r) => r.cuisines.some((c) => ['热菜', '家常菜', '凉菜'].includes(c)) && !isSoupLike(r),
      (r) => r.cuisines.some((c) => ['主食', '面食'].includes(c)) && !isSoupLike(r),
    ],
  },
  {
    slot: 'soup',
    label: '暖身汤羹',
    size: 1,
    distinctFrom: ['main'],
    picks: [(r) => r.cuisines.includes('汤羹'), () => true],
    fallback: '今天没有汤羹类菜谱。',
  },
  {
    slot: 'western',
    label: '换个口味 · 西餐',
    size: 1,
    distinctFrom: ['main'],
    picks: [(r) => r.cuisines.includes('西餐')],
    fallback: '今天没有西餐类菜谱，试试其他菜系。',
  },
  {
    slot: 'dessert',
    label: '餐后甜品',
    size: 1,
    distinctFrom: ['main', 'soup'],
    picks: [(r) => r.cuisines.some((c) => ['甜品', '烘焙', '甜点'].includes(c))],
    fallback: '今天没有甜品烘焙类菜谱。',
  },
  {
    slot: 'light',
    label: '再来一道',
    size: 1,
    distinctFrom: ['main', 'soup', 'dessert', 'western'],
    picks: [(r) => r.cuisines.some((c) => ['凉菜', '小吃', '素菜'].includes(c)), () => true],
  },
];

export function blocksFor(meal: MealWindowKey): RecommendationBlock[] {
  if (meal === 'breakfast') return BREAKFAST_BLOCKS;
  if (meal === 'lunch') return LUNCH_BLOCKS;
  return DINNER_BLOCKS;
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

export type RecommendedDish = {
  recipe: Recipe;
  slot: RecommendationSlot;
  slotLabel: string;
  /** 为什么推它（用于界面上的小标签）。 */
  reasons: string[];
};

export type RecommendationBatch = {
  windowId: string;
  meal: MealWindowKey;
  mealLabel: string;
  /** 换批种子，便于「同一批稳定、点刷新才换」。 */
  seed: string;
  /** 参与推荐的候选菜总数。 */
  candidateCount: number;
  /** 按主菜 / 汤 / 甜品 / 西餐等分好组的结果。 */
  groups: { slot: RecommendationSlot; label: string; dishes: RecommendedDish[] }[];
  /** 拉平后的顺序，方便做单列卡片流。 */
  dishes: RecommendedDish[];
  /** 需要提醒用户的话（例如该餐次候选不足，已放宽范围）。 */
  note?: string;
  fallback?: string;
};

export type RecommendationOptions = {
  /** 当前时间，默认 new Date()。 */
  now?: Date;
  /** 覆盖时间段（用户手动点「早餐 / 午餐 / 晚餐」时用）。 */
  meal?: MealWindowKey;
  /** 随机种子；同一 seed + 同一候选集合 = 同一批结果。 */
  seed?: string;
  /** 主菜也参与搭配分组（默认 true）。 */
  includeMain?: boolean;
  /** 最近已推过的菜谱 id，尽量避开，让「换一批」有新鲜感（只影响新鲜度，不是忌口）。 */
  seenIds?: string[];
};

/** 生成一批「今日推荐」。
 *
 * 打分权重：冰箱已有食材 +6、合口味 +2、用时短的略加分（-0.1/分钟）；
 * 抽取时按权重随机，所以同一时间段里每次换批结果都不同，又始终偏向用户偏好。
 */
export function buildRecommendation(
  recipes: Recipe[],
  conditions: PlanConditions,
  pantry: PantryItem[],
  options: RecommendationOptions = {},
): RecommendationBatch {
  const now = options.now ?? new Date();
  const meal = options.meal ?? windowMeal(now);
  const winId = options.meal ? `${windowId(now)}-manual-${meal}` : windowId(now);
  const seed = options.seed ?? winId;
  const random = seededRandom(seed);

  const conditionsSafe: PlanConditions = {
    ...conditions,
    flavors: conditions.flavors ?? [],
    avoidIngredients: conditions.avoidIngredients ?? [],
    preferPantry: conditions.preferPantry ?? true,
  };
  const eligible = filterByConditions(recipes, conditionsSafe);
  const candidates = eligible.filter((r) => canonicalMeal(r, meal) === meal);
  const pool = candidates.length ? candidates : eligible;
  const seen = new Set(options.seenIds ?? []);
  // 只有「避开最近推荐」不会把候选池掏空时，才真正启用去重。
  const seenActive = pool.filter((r) => !seen.has(r.id)).length >= 4;

  const score = (recipe: Recipe) =>
    (conditionsSafe.preferPantry ? pantryScore(recipe, pantry) * 6 : 0) +
    flavorScore(recipe, conditionsSafe.flavors) * 2 -
    (matchesAvoid(recipe, conditionsSafe.avoidIngredients) ? 4 : 0) -
    Math.min(recipe.estimatedMinutes ?? 30, 60) * 0.1;

  const used = new Set<string>();
  const dish = (recipe: Recipe, slot: RecommendationSlot, slotLabel: string): RecommendedDish => ({
    recipe,
    slot,
    slotLabel,
    reasons: [
      ...(pantryScore(recipe, pantry) > 0 ? ['冰箱里已有食材'] : []),
      ...(flavorScore(recipe, conditionsSafe.flavors) > 0 ? ['合你口味'] : []),
      ...(recipe.estimatedMinutes && recipe.estimatedMinutes <= 20 ? ['上手快'] : []),
    ],
  });

  /**
   * 从候选中按权重随机抽一个。
   * `fresh` 为 true 时排除本批已用过的和最近推过的；`blocked` 是被其它分组占用的菜。
   */
  function draw(
    picks: ((r: Recipe) => boolean)[],
    fresh: boolean,
    blocked: Set<string> = new Set(),
  ): Recipe | undefined {
    for (const pick of picks) {
      const from = pool.filter(
        (r) =>
          pick(r) &&
          !blocked.has(r.id) &&
          (!fresh || (!used.has(r.id) && !(seenActive && seen.has(r.id)))),
      );
      if (!from.length) continue;
      // 保持所有菜都有非零概率；忌口只降权，不会被硬过滤。
      const weights = from.map((r) => Math.max(0.1, 8 + score(r)));
      const total = weights.reduce((sum, w) => sum + w, 0);
      let target = random() * total;
      for (let i = 0; i < from.length; i++) {
        target -= weights[i];
        if (target <= 0) return from[i];
      }
      return from[from.length - 1];
    }
    return undefined;
  }

  const groups: RecommendationBatch['groups'] = [];
  const includeMain = options.includeMain ?? true;
  /** 每个分组已经选中的菜，用于避免同一道菜重复出现在多个分组。 */
  const bySlot = new Map<RecommendationSlot, Set<string>>();
  for (const block of blocksFor(meal)) {
    if (block.slot === 'main' && !includeMain) continue;
    const blocked = new Set<string>();
    for (const slot of block.distinctFrom ?? []) {
      for (const id of bySlot.get(slot) ?? []) blocked.add(id);
    }
    const picked: RecommendedDish[] = [];
    for (let i = 0; i < block.size; i++) {
      // 先挑没推过的新菜，实在没有了再退而求其次；被 distinctFrom 挡住的菜不再入选。
      const recipe = draw(block.picks, true, blocked) ?? draw(block.picks, false, blocked);
      if (!recipe || picked.some((d) => d.recipe.id === recipe.id)) continue;
      used.add(recipe.id);
      picked.push(dish(recipe, block.slot, block.label));
    }
    if (picked.length) {
      bySlot.set(block.slot, new Set(picked.map((d) => d.recipe.id)));
      groups.push({ slot: block.slot, label: block.label, dishes: picked });
    }
  }

  const dishes = groups.flatMap((g) => g.dishes);
  const relaxed = !candidates.length && eligible.length > 0;
  return {
    windowId: winId,
    meal,
    mealLabel: mealLabels[meal],
    seed,
    candidateCount: pool.length,
    groups,
    dishes,
    note: relaxed ? `符合${mealLabels[meal]}的菜谱不够，先按你的偏好从全部菜谱里挑。` : undefined,
    fallback: pool.length ? undefined : '没有符合当前偏好与忌口的菜谱，请到「偏好记忆」放宽条件。',
  };
}

/** 一批「随机推荐」的结果：不再区分时段，也不分主菜/汤/甜品。 */
export type RandomBatch = {
  /** 本批种子，换一批就换一个。 */
  seed: string;
  /** 参与抽取的候选菜总数。 */
  candidateCount: number;
  dishes: RecommendedDish[];
  fallback?: string;
  note?: string;
};

export type RandomPickOptions = {
  /** 随机种子；同一 seed 得到同一批。 */
  seed?: string;
  /** 抽几道，默认 6。 */
  count?: number;
  /** 最近推过的菜，降低权重以获得新鲜感（不是忌口）。 */
  seenIds?: string[];
};

/** 按权重不放回抽样（权重越大越容易被抽到）。 */
function weightedSample<T extends { weight: number }>(
  pool: T[],
  count: number,
  random: () => number,
): T[] {
  const items = [...pool];
  const picked: T[] = [];
  while (picked.length < count && items.length) {
    const total = items.reduce((sum, item) => sum + Math.max(item.weight, 0.01), 0);
    let ticket = random() * total;
    let index = 0;
    for (let i = 0; i < items.length; i++) {
      ticket -= Math.max(items[i].weight, 0.01);
      if (ticket <= 0) {
        index = i;
        break;
      }
      index = i;
    }
    picked.push(items[index]);
    items.splice(index, 1);
  }
  return picked;
}

/**
 * 随机推荐一批菜：**不按时段**，只按用户口味偏好加权随机。
 *
 * 权重构成：合口味（每个命中 +2）、家里食材齐（+0.5）、20 分钟内能上桌（+0.3）；
 * 刚推过的菜权重打到 0.25，让「换一批」有新鲜感。
 * 菜名、菜谱内容全部来自真实菜谱库，不经过任何生成模型。
 */
export function buildRandomPicks(
  recipes: Recipe[],
  conditions: PlanConditions,
  pantry: PantryItem[],
  options: RandomPickOptions = {},
): RandomBatch {
  const count = options.count ?? 6;
  const seed = options.seed ?? `pick-${Date.now()}`;
  const random = seededRandom(`${seed}#${count}`);
  const seen = new Set(options.seenIds ?? []);
  const conditionsSafe: PlanConditions = {
    ...conditions,
    flavors: conditions.flavors ?? [],
    avoidIngredients: conditions.avoidIngredients ?? [],
    preferPantry: conditions.preferPantry ?? true,
  };

  const candidates = filterByConditions(recipes, conditionsSafe);
  if (!candidates.length) {
    return {
      seed,
      candidateCount: 0,
      dishes: [],
      fallback: '没有符合条件的菜谱，先去「偏好记忆」里放宽忌口或难度试试。',
    };
  }

  const pool = candidates.map((recipe) => {
    const reasons: string[] = [];
    let weight = 1;
    const hits = conditionsSafe.flavors.filter((flavor) =>
      [recipe.name, ...recipe.flavorTags, ...recipe.cuisines].some((text) => text.includes(flavor)),
    );
    if (hits.length) {
      weight += 2 * hits.length;
      reasons.push(`合你的口味：${hits.join('、')}`);
    }
    if (pantryScore(recipe, pantry) > 0) {
      weight += 0.5;
      reasons.push('家里食材差不多齐了');
    }
    if (recipe.estimatedMinutes && recipe.estimatedMinutes <= 20) {
      weight += 0.3;
      reasons.push(`${recipe.estimatedMinutes} 分钟能上桌`);
    }
    if (seen.has(recipe.id)) weight *= 0.25;
    return { recipe, weight, reasons };
  });

  const dishes: RecommendedDish[] = weightedSample(pool, Math.min(count, pool.length), random).map(
    (item) => ({
      recipe: item.recipe,
      slot: 'main',
      slotLabel: item.recipe.cuisines[0] ?? '家常',
      reasons: item.reasons.length ? item.reasons : ['随机给你挑的'],
    }),
  );

  return {
    seed,
    candidateCount: candidates.length,
    dishes,
    note:
      candidates.length < count
        ? `符合条件的菜只有 ${candidates.length} 道，已全部推给你。`
        : undefined,
  };
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  normal: '普通',
  advanced: '进阶',
};

/** 把食材列表压成一行「名称 + 用量」，太长就截断。 */
export function formatIngredients(ingredients: RecipeIngredient[], limit = 8) {
  const names = ingredients.map((i) => `${i.name}${i.amount ? ` ${i.amount}` : ''}${i.unit ?? ''}`);
  if (names.length <= limit) return names.join('、');
  return `${names.slice(0, limit).join('、')} 等 ${names.length} 样`;
}

import type {
  PreferenceDimension,
  PreferenceMemory,
  Preferences,
  Recipe,
  RecipeStep,
} from '../types/models';

export const MEMORY_LABELS: Record<PreferenceDimension, string> = {
  spiciness: '辣度',
  sweetness: '甜度',
  saltiness: '咸淡',
  sourness: '酸度',
  greasiness: '油腻',
  seasoning: '调味浓淡',
  liked_dish: '喜欢的味道',
  disliked_ingredient: '不吃的食材',
};

export function memoryNote(memory: PreferenceMemory): string {
  const positive = memory.polarity > 0;
  if (memory.dimension === 'disliked_ingredient') {
    return `避开${memory.evidence.at(-1)?.text.replace(/^(不吃|忌口|过敏|不喜欢)/, '') ?? '某些食材'}`;
  }
  if (memory.dimension === 'liked_dish') {
    return `喜欢${memory.evidence.at(-1)?.text.replace(/^喜欢(吃|喝)?/, '') ?? '的口味'}`;
  }
  const notes: Record<
    Exclude<PreferenceDimension, 'liked_dish' | 'disliked_ingredient'>,
    [string, string]
  > = {
    spiciness: ['辣一点', '少辣'],
    sweetness: ['甜一点', '少甜'],
    saltiness: ['咸一点', '少盐'],
    sourness: ['酸一点', '少酸'],
    greasiness: ['油润一点', '少油'],
    seasoning: ['调味浓一点', '调味淡一点'],
  };
  return notes[memory.dimension][positive ? 0 : 1];
}

export function memoryTitle(memory: PreferenceMemory): string {
  return `${MEMORY_LABELS[memory.dimension]}${memory.polarity > 0 ? ' +' : ' '}${memory.polarity}`;
}

export function planningFlavors(memories: PreferenceMemory[]): string[] {
  const flavors = new Set<string>();
  for (const memory of memories) {
    if (!memory.active) continue;
    if (memory.dimension === 'spiciness') flavors.add(memory.polarity > 0 ? '辣' : '清淡');
    if (memory.dimension === 'sweetness' && memory.polarity > 0) flavors.add('甜');
    if (memory.dimension === 'sourness' && memory.polarity > 0) flavors.add('酸');
    if (memory.dimension === 'saltiness' && memory.polarity < 0) flavors.add('清淡');
    if (memory.dimension === 'greasiness' && memory.polarity < 0) flavors.add('清淡');
    if (memory.dimension === 'seasoning' && memory.polarity > 0) flavors.add('咸鲜');
    if (memory.dimension === 'liked_dish') {
      const last = memory.evidence[memory.evidence.length - 1]?.text;
      const term = last?.replace(/^喜欢(吃|喝)?/, '').trim();
      if (term) flavors.add(term);
    }
  }
  return [...flavors];
}

export type PreferenceTag = {
  kind: 'liked' | 'avoid';
  value: string;
  label: string;
};

/** 旧版偏好标签与结构化记忆共用同一套文案，避免菜谱页和偏好页显示不一致。 */
export function preferenceTagLabel(kind: PreferenceTag['kind'], value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (kind === 'avoid') return trimmed.startsWith('避开') ? trimmed : `避开${trimmed}`;
  return trimmed.startsWith('喜欢') ? trimmed : `喜欢${trimmed}`;
}

export function activeMemoryNotes(
  memories: PreferenceMemory[],
  preferences?: Preferences,
): string[] {
  const notes = memories.filter((item) => item.active).map(memoryNote);
  for (const item of preferences?.flavorPreferences ?? [])
    notes.push(preferenceTagLabel('liked', item));
  for (const item of preferences?.avoidIngredients ?? [])
    notes.push(preferenceTagLabel('avoid', item));
  return [...new Set(notes.filter(Boolean))];
}

/**
 * 偏好页里还没被结构化记忆卡片覆盖的旧版标签。
 * 这些标签同样会参与开始烹饪时的口味调整，必须在记忆库里可见。
 */
export function extraPreferenceTags(
  memories: PreferenceMemory[],
  preferences?: Preferences,
): PreferenceTag[] {
  const activeNotes = new Set(memories.filter((item) => item.active).map(memoryNote));
  const seen = new Set<string>();
  const result: PreferenceTag[] = [];
  const add = (kind: PreferenceTag['kind'], value: string) => {
    const label = preferenceTagLabel(kind, value);
    if (!label || activeNotes.has(label) || seen.has(label)) return;
    seen.add(label);
    result.push({ kind, value, label });
  };
  for (const item of preferences?.flavorPreferences ?? []) add('liked', item);
  for (const item of preferences?.avoidIngredients ?? []) add('avoid', item);
  return result;
}

export type DerivedMemory = {
  dimension: PreferenceDimension;
  polarity: number;
  source: 'explicit' | 'inferred';
  evidence: string;
};

function termsAfter(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match?.[1]) return [];
  return match[1]
    .split(/(?:和|、|,|，|\s|以及|还有)+/)
    .map((item) => item.replace(/^(吃|喝)/, '').trim())
    .filter((item) => item.length >= 1 && item.length <= 8);
}

/**
 * 本地偏好解析：设置页聊天和做菜时的口味反馈共用。
 * 明确指令（不吃/少放/喜欢）即时生效；“太咸了”这类反馈按推断累计。
 */
export function deriveMemoryEvidence(text: string): DerivedMemory[] {
  const value = text.trim();
  if (!value) return [];
  const result: DerivedMemory[] = [];
  const add = (
    dimension: PreferenceDimension,
    polarity: number,
    evidence: string,
    source: DerivedMemory['source'] = 'explicit',
  ) => {
    if (result.some((item) => item.dimension === dimension)) return;
    result.push({ dimension, polarity, evidence, source });
  };

  const explicit =
    /以后|记住|我不|不吃|忌口|过敏|不喜欢|少放|多放|喜欢|爱|清淡|少盐|少油|少糖|少辣/.test(value);
  const inferred = !explicit && /太|有点|稍微|偏/.test(value);

  if (/不吃辣|不能吃辣|怕辣|太辣|辣死|少辣|少吃辣|少放辣|微辣|清淡/.test(value)) {
    add('spiciness', /微辣/.test(value) ? 1 : -2, value, inferred ? 'inferred' : 'explicit');
  } else if (/(喜欢|爱|多放|来点|要).{0,2}(辣|辣椒)/.test(value)) {
    add('spiciness', 2, value, 'explicit');
  }

  if (/太咸|咸了|少盐|少放盐|淡一点|清淡|口味淡/.test(value)) {
    add('saltiness', -2, value, inferred ? 'inferred' : 'explicit');
  } else if (/咸一点|多放盐|口味重/.test(value)) {
    add('saltiness', 1, value, 'explicit');
  }

  if (/太甜|甜了|少糖|少放糖|不甜|不吃糖/.test(value)) {
    add('sweetness', -2, value, inferred ? 'inferred' : 'explicit');
  } else if (/甜一点|多放糖|喜欢甜/.test(value)) {
    add('sweetness', 1, value, 'explicit');
  }

  if (/太酸|酸了|少酸|少放醋/.test(value)) {
    add('sourness', -2, value, inferred ? 'inferred' : 'explicit');
  } else if (/酸一点|多放醋|喜欢酸/.test(value)) {
    add('sourness', 1, value, 'explicit');
  }

  if (/太油|油腻|少油|少放油|不油/.test(value)) {
    add('greasiness', -2, value, inferred ? 'inferred' : 'explicit');
  } else if (/油润|多放油/.test(value)) {
    add('greasiness', 1, value, 'explicit');
  }

  if (/太淡|没味|调味淡|少放酱油|少放生抽/.test(value)) {
    add('seasoning', -1, value, inferred ? 'inferred' : 'explicit');
  } else if (/入味|味重|多放酱油|多放生抽/.test(value)) {
    add('seasoning', 1, value, 'explicit');
  }

  const avoid = termsAfter(value, /(?:不吃|忌口|过敏|不喜欢)([^，。,.！!？?]+)/);
  for (const term of avoid) {
    if (/辣|咸|甜|酸|油/.test(term)) continue;
    result.push({
      dimension: 'disliked_ingredient',
      polarity: -2,
      evidence: `不吃${term}`,
      source: 'explicit',
    });
  }

  const liked = termsAfter(value, /喜欢(?:吃|喝)?([^，。,.！!？?]+)/);
  for (const term of liked) {
    if (/辣|咸|甜|酸|油|清淡/.test(term)) continue;
    result.push({
      dimension: 'liked_dish',
      polarity: 2,
      evidence: `喜欢${term}`,
      source: 'explicit',
    });
  }

  return result;
}

export function preferenceTerms(text: string) {
  const avoid = termsAfter(text, /(?:不吃|忌口|过敏|不喜欢)([^，。,.！!？?]+)/);
  const liked = termsAfter(text, /喜欢(?:吃|喝)?([^，。,.！!？?]+)/);
  return { avoid, liked };
}

export function personalizeRecipe(
  recipe: Recipe,
  memories: PreferenceMemory[],
  preferences?: Preferences,
): { steps: RecipeStep[]; summary: string; notes: string[] } {
  const active = memories.filter((item) => item.active);
  const notes = activeMemoryNotes(active, preferences);
  const summary = notes.length
    ? `按你的记忆：${notes.join('、')}。`
    : '按你的记忆：暂时没有特殊调整，保持原味。';

  const find = (dimension: PreferenceDimension) =>
    active.find((item) => item.dimension === dimension);
  const salt = find('saltiness');
  const oil = find('greasiness');
  const spicy = find('spiciness');
  const sweet = find('sweetness');
  const sour = find('sourness');
  const seasoning = find('seasoning');
  const disliked = [
    ...new Set([
      ...(preferences?.avoidIngredients ?? []),
      ...active
        .filter((item) => item.dimension === 'disliked_ingredient')
        .flatMap((item) =>
          item.evidence.map((entry) => entry.text.replace(/^(不吃|忌口|过敏|不喜欢)/, '').trim()),
        ),
    ]),
  ].filter(Boolean);
  const likesSweet = sweet
    ? sweet.polarity > 0
    : (preferences?.flavorPreferences ?? []).some((value) => /甜/.test(value));
  const mild = (preferences?.flavorPreferences ?? []).some((value) => /清淡|少辣|微辣/.test(value));

  const steps = recipe.steps
    .flatMap((step) => {
      // 仅去掉包含忌口的独立操作分句，保留同一步中的其他操作。
      const instruction = step.instruction
        .split(/(?<=[，,；;。])/)
        .filter((clause) => !disliked.some((item) => clause.includes(item)))
        .join('')
        .trim();
      if (!instruction || /^[，,；;。\s]+$/.test(instruction)) return [];
      const adjustments: string[] = [];
      if (salt && salt.polarity < 0 && /盐|生抽|老抽|酱油|蚝油|豆瓣酱/.test(step.instruction))
        adjustments.push('盐和酱油少放一点');
      if (oil && oil.polarity < 0 && /油|煎|炸|炒|爆香/.test(step.instruction))
        adjustments.push('油可以少一点');
      if (spicy) {
        if (spicy.polarity > 0 && /辣|辣椒|豆瓣酱|花椒/.test(step.instruction))
          adjustments.push('辣味可以多一点');
        if (spicy.polarity < 0 && /辣|辣椒|豆瓣酱|花椒/.test(step.instruction))
          adjustments.push('辣椒少放一点');
      }
      if (sweet && sweet.polarity < 0 && /糖|冰糖|蜂蜜/.test(step.instruction))
        adjustments.push('糖少放一点');
      if (likesSweet && /糖|冰糖|蜂蜜/.test(instruction))
        adjustments.push('这一步糖在原用量上增加约10%，少量加入后尝味');
      if (mild && !spicy && /辣椒|豆瓣酱|辣/.test(instruction))
        adjustments.push('辣椒用量减少约三分之一，保留菜品本身的风味');
      if (sour && sour.polarity < 0 && /醋|柠檬|酸/.test(step.instruction))
        adjustments.push('酸味少一点');
      if (seasoning && seasoning.polarity < 0 && /调味|酱汁|汁/.test(step.instruction))
        adjustments.push('调味淡一点');
      if (!adjustments.length) return [{ ...step, instruction }];
      return {
        ...step,
        instruction: `${instruction}（口味调整：${adjustments.join('；')}）`,
        personalization: [step.personalization, `按记忆：${adjustments.join('；')}`]
          .filter(Boolean)
          .join(' '),
      };
    })
    .map((step, order) => ({ ...step, order }));

  return { steps, summary, notes };
}

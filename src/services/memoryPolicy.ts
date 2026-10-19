import type { PreferenceDimension, PreferenceMemory } from '../types/models';

/**
 * 记忆写入的阈值规则。
 *
 * - 明示（explicit）：用户主动陈述偏好，1 次立即生效
 * - 情境推断（inferred）：用户只是描述当前这道菜，需同向累计 3 次
 * - 烹饪反馈（feedback）：烹饪后的结构化反馈，2 次生效
 *
 * 未达阈值的证据仍会记录在 `evidence` 里（界面上可见但标注「暂未生效」）。
 */
export const MEMORY_THRESHOLDS = {
  explicit: 1,
  inferred: 3,
  feedback: 2,
} as const;

export type MemorySource = keyof typeof MEMORY_THRESHOLDS;

export type MemoryEvidenceInput = {
  dimension: PreferenceDimension;
  /** -2 ~ +2，0 视为无方向，直接忽略 */
  polarity: number;
  source: MemorySource;
  evidence: string;
  at?: string;
};

export type MemoryApplyResult = {
  next: PreferenceMemory;
  /** 本次写入是否让这条记忆「首次生效」 */
  activated: boolean;
};

function clampPolarity(value: number): -2 | -1 | 0 | 1 | 2 {
  const rounded = Math.max(-2, Math.min(2, Math.round(value)));
  return rounded as -2 | -1 | 0 | 1 | 2;
}

function signOf(polarity: number): -1 | 0 | 1 {
  if (polarity > 0) return 1;
  if (polarity < 0) return -1;
  return 0;
}

function confidenceFor(source: MemorySource, active: boolean, positiveCount: number): number {
  if (!active) return 0.2;
  if (source === 'explicit') return 0.9;
  const threshold = MEMORY_THRESHOLDS[source];
  const base = source === 'feedback' ? 0.6 : 0.5;
  return Math.min(0.85, base + 0.1 * Math.max(0, positiveCount - threshold));
}

/**
 * 应用一条证据，返回更新后的记忆。
 *
 * 规则说明：
 * - 同向证据：同向计数 +1，反向计数 -1（抵消）
 * - 反向证据：反向计数 +1；反向计数达到阈值时**翻转**方向，避免偏好被永久锁死
 * - 明示证据会把来源升级为 explicit（推断的 3 次要求随之变成 1 次）
 */
export function applyMemoryEvidence(
  current: PreferenceMemory | undefined,
  input: MemoryEvidenceInput,
  now = new Date().toISOString(),
): MemoryApplyResult {
  const polarity = clampPolarity(input.polarity);
  const threshold = MEMORY_THRESHOLDS[input.source];
  const evidenceEntry = {
    text: input.evidence.slice(0, 120),
    at: input.at ?? now,
    source: input.source,
  };

  // 无方向的证据不改变偏好，但仍记录，便于用户查看
  if (signOf(polarity) === 0) {
    const base: PreferenceMemory = current ?? {
      id: `memory-${input.dimension}`,
      createdAt: now,
      updatedAt: now,
      dimension: input.dimension,
      polarity: 0,
      confidence: 0.2,
      source: input.source,
      active: false,
      evidence: [],
      positiveCount: 0,
      negativeCount: 0,
    };
    return {
      next: { ...base, evidence: [...base.evidence, evidenceEntry].slice(-12), updatedAt: now },
      activated: false,
    };
  }

  if (!current) {
    const positiveCount = 1;
    const active = positiveCount >= threshold;
    return {
      activated: active,
      next: {
        id: `memory-${input.dimension}`,
        createdAt: now,
        updatedAt: now,
        dimension: input.dimension,
        polarity,
        confidence: confidenceFor(input.source, active, positiveCount),
        source: input.source,
        active,
        evidence: [evidenceEntry],
        positiveCount,
        negativeCount: 0,
      },
    };
  }

  const sameDirection =
    signOf(current.polarity) === 0 || signOf(current.polarity) === signOf(polarity);

  let nextPolarity: PreferenceMemory['polarity'] = current.polarity;
  let positiveCount = current.positiveCount;
  let negativeCount = current.negativeCount;
  let source: MemorySource = current.source;

  if (sameDirection) {
    positiveCount = current.positiveCount + 1;
    negativeCount = Math.max(0, current.negativeCount - 1);
    nextPolarity = polarity;
    // 明示优先于推断
    if (input.source === 'explicit' || current.source !== 'explicit') source = input.source;
  } else {
    negativeCount = current.negativeCount + 1;
    if (negativeCount >= MEMORY_THRESHOLDS[input.source]) {
      // 反向证据足够多，翻转方向
      nextPolarity = polarity;
      positiveCount = negativeCount;
      negativeCount = 0;
      source = input.source;
    }
  }

  const effectiveThreshold = MEMORY_THRESHOLDS[source];
  const wasActive = current.active;
  const active = positiveCount >= effectiveThreshold;

  return {
    activated: active && !wasActive,
    next: {
      ...current,
      polarity: nextPolarity,
      source,
      positiveCount,
      negativeCount,
      active,
      confidence: confidenceFor(source, active, positiveCount),
      evidence: [...current.evidence, evidenceEntry].slice(-12),
      updatedAt: now,
    },
  };
}

/** 只保留「已生效」的记忆，供推荐与菜谱个性化使用。 */
export function activeMemories(list: PreferenceMemory[]): PreferenceMemory[] {
  return list.filter((item) => item.active);
}

/** 把生效的记忆转成人类可读的口味标签，喂给推荐引擎或模型。 */
export function memoryLabels(list: PreferenceMemory[]): string[] {
  const dimensionText: Record<PreferenceDimension, string> = {
    spiciness: '辣度',
    sweetness: '甜度',
    saltiness: '咸淡',
    sourness: '酸度',
    greasiness: '油腻程度',
    seasoning: '调味浓淡',
    liked_dish: '喜欢的菜',
    disliked_ingredient: '不喜欢的食材',
  };
  return activeMemories(list).map(
    (item) =>
      `${dimensionText[item.dimension]}${item.polarity > 0 ? '偏多' : '偏少'}（${item.polarity > 0 ? '+' : ''}${item.polarity}）`,
  );
}

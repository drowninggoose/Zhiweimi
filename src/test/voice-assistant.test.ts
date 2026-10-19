import { describe, expect, test } from 'vitest';
import type { PreferenceMemory } from '../types/models';
import {
  MEMORY_THRESHOLDS,
  activeMemories,
  applyMemoryEvidence,
  memoryLabels,
} from '../services/memoryPolicy';
import {
  BANNED_COMMANDS,
  cleanAnswer,
  deriveRecommendQuery,
  normalizeChatResult,
  softenCommandLanguage,
} from '../../server/voiceGateway';

const NOW = '2026-10-17T12:00:00.000Z';

function feed(
  times: number,
  polarity: number,
  source: 'explicit' | 'inferred' | 'feedback',
  dimension: PreferenceMemory['dimension'] = 'spiciness',
): PreferenceMemory {
  let current: PreferenceMemory | undefined;
  for (let i = 0; i < times; i++) {
    const result = applyMemoryEvidence(
      current,
      { dimension, polarity, source, evidence: `第${i + 1}次`, at: NOW },
      NOW,
    );
    current = result.next;
  }
  return current!;
}

describe('记忆写入的 3 次阈值规则', () => {
  test('阈值配置：明示 1 次 / 推断 3 次 / 反馈 2 次', () => {
    expect(MEMORY_THRESHOLDS.explicit).toBe(1);
    expect(MEMORY_THRESHOLDS.inferred).toBe(3);
    expect(MEMORY_THRESHOLDS.feedback).toBe(2);
  });

  test('明示偏好 1 次立即生效', () => {
    const memory = feed(1, 2, 'explicit');
    expect(memory.active).toBe(true);
    expect(memory.polarity).toBe(2);
    expect(memory.confidence).toBe(0.9);
  });

  test('情境推断必须累计 3 次才生效', () => {
    const first = feed(1, 1, 'inferred');
    expect(first.active).toBe(false);
    expect(first.positiveCount).toBe(1);

    const second = feed(2, 1, 'inferred');
    expect(second.active).toBe(false);
    expect(second.positiveCount).toBe(2);

    const third = feed(3, 1, 'inferred');
    expect(third.active).toBe(true);
    expect(third.confidence).toBeGreaterThanOrEqual(0.5);
  });

  test('未达阈值的证据也会保留，便于界面展示', () => {
    const memory = feed(2, 1, 'inferred');
    expect(memory.active).toBe(false);
    expect(memory.evidence).toHaveLength(2);
  });

  test('烹饪反馈累计 2 次生效', () => {
    expect(feed(1, -1, 'feedback').active).toBe(false);
    expect(feed(2, -1, 'feedback').active).toBe(true);
  });

  test('反向证据累计到阈值会翻转方向，偏好不会被永久锁死', () => {
    const positive = feed(3, 2, 'inferred');
    expect(positive.polarity).toBe(2);
    expect(positive.active).toBe(true);

    let current = positive;
    for (let i = 0; i < 3; i++) {
      current = applyMemoryEvidence(
        current,
        { dimension: 'spiciness', polarity: -2, source: 'inferred', evidence: '太辣了', at: NOW },
        NOW,
      ).next;
    }
    expect(current.polarity).toBe(-2);
    expect(current.negativeCount).toBe(0);
  });

  test('polarity 为 0 时不改变方向，但仍记录证据', () => {
    const memory = feed(1, 0, 'explicit');
    expect(memory.polarity).toBe(0);
    expect(memory.active).toBe(false);
    expect(memory.evidence).toHaveLength(1);
  });

  test('只有生效的记忆才进入推荐与菜谱调整', () => {
    const pending = feed(1, 1, 'inferred');
    const active = feed(1, 2, 'explicit', 'saltiness');
    expect(activeMemories([pending, active])).toHaveLength(1);
    expect(memoryLabels([pending, active])[0]).toContain('咸淡');
  });
});

describe('语音回答的语气与结构校验', () => {
  test('命令式表达会被软化成建议式', () => {
    const softened = softenCommandLanguage('你必须再煮10分钟，马上关火');
    for (const banned of BANNED_COMMANDS) {
      expect(softened).not.toContain(banned);
    }
    expect(softened).toContain('再煮10分钟');
  });

  test('非法意图被过滤，全非法时回退为 ask', () => {
    expect(normalizeChatResult({ intents: ['remedy', '说笑话'] }).intents).toEqual(['remedy']);
    expect(normalizeChatResult({ intents: ['说笑话'] }).intents).toEqual(['ask']);
    expect(normalizeChatResult({ intents: [] }).intents).toEqual(['ask']);
  });

  test('非法记忆维度被丢弃，极性被限制在 -2~2，0 不写入', () => {
    const result = normalizeChatResult({
      memory: [
        { dimension: 'spiciness', polarity: 9, evidence: '我喜欢辣' },
        { dimension: '瞎编维度', polarity: 1, evidence: 'x' },
        { dimension: 'saltiness', polarity: 0, evidence: '不咸不淡' },
      ],
    });
    expect(result.memory).toHaveLength(1);
    expect(result.memory[0].polarity).toBe(2);
    expect(result.memory[0].source).toBe('explicit');
  });

  test('answer 与每条动作都会过一遍语气软化', () => {
    const result = normalizeChatResult({
      answer: '你必须继续加热',
      actions: [
        { do: '你应该多翻动', amount: '每 30 秒', when: '你现在', check: '必须闻到香气' },
      ],
      intents: ['suggest'],
    });
    expect(result.answer).not.toContain('必须');
    expect(result.actions[0].do).not.toContain('应该');
    expect(result.actions[0].check).not.toContain('必须');
    // 用量与时机原样保留，不做改写
    expect(result.actions[0].amount).toBe('每 30 秒');
  });

  test('缺少 answer 时有兜底文案，缺失 actions 时为空数组', () => {
    const result = normalizeChatResult({ intents: ['ask'] });
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.actions).toEqual([]);
    expect(result.recommendQuery).toBeNull();
    expect(result.wantRecommend).toBe(false);
  });

  test('模型漏判推荐时，用户原话含「推荐」也会触发本地推荐', () => {
    const result = normalizeChatResult({ intents: ['suggest'], answer: '可以试试这些' }, '推荐几道辣菜');
    expect(result.wantRecommend).toBe(true);
    expect(result.intents).toContain('recommend');
    // 模型没给 query 时，从原话推导出「辣」
    expect(result.recommendQuery?.flavors).toContain('辣');
  });

  test('从口味记忆推导检索条件', () => {
    expect(deriveRecommendQuery('有什么好吃的', [{ dimension: 'spiciness', polarity: 2 }]).flavors).toContain('辣');
    expect(deriveRecommendQuery('有什么好吃的', [{ dimension: 'greasiness', polarity: -1 }]).flavors).toContain('清淡');
    expect(deriveRecommendQuery('我想吃汤', []).flavors).toContain('汤');
  });

  test('回答正文里的 JSON 字段名残留会被清理掉', () => {
    const cleaned = cleanAnswer(
      '我给你挑了几道。\n关于推荐别的菜：\nflavors: 辣, 家常菜\nexclude: null',
    );
    expect(cleaned).toBe('我给你挑了几道。');
    expect(cleaned).not.toContain('flavors');
    expect(cleaned).not.toContain('exclude');
  });

  test('正常的自然语言回答不会被误删', () => {
    const text = '先补少许盐约 1 克，尝一口汤汁觉得咸淡合适就行。';
    expect(cleanAnswer(text)).toBe(text);
  });
});

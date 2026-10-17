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

  test('非法记忆维度被丢弃，极性被限制在 -2~2', () => {
    const result = normalizeChatResult({
      memory: [
        { dimension: 'spiciness', polarity: 9, evidence: '我喜欢辣' },
        { dimension: '瞎编维度', polarity: 1, evidence: 'x' },
      ],
    });
    expect(result.memory).toHaveLength(1);
    expect(result.memory[0].polarity).toBe(2);
    expect(result.memory[0].source).toBe('explicit');
  });

  test('subtitle 与 detail 都会过一遍语气软化', () => {
    const result = normalizeChatResult({
      subtitle: '你必须继续加热',
      detail: ['你应该多翻动'],
      intents: ['suggest'],
    });
    expect(result.subtitle).not.toContain('必须');
    expect(result.detail[0]).not.toContain('应该');
  });

  test('缺失 recommendQuery 时为 null，缺少 subtitle 时有兜底文案', () => {
    const result = normalizeChatResult({ intents: ['ask'] });
    expect(result.recommendQuery).toBeNull();
    expect(result.subtitle.length).toBeGreaterThan(0);
  });
});

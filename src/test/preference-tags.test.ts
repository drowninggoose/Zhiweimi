import { expect, test } from 'vitest';
import { activeMemoryNotes, extraPreferenceTags } from '../services/preferenceMemoryService';
import type { PreferenceMemory, Preferences } from '../types/models';

const NOW = '2026-10-23T00:00:00.000Z';

function memory(
  dimension: PreferenceMemory['dimension'],
  polarity: number,
  evidence: string,
): PreferenceMemory {
  return {
    id: `memory-${dimension}`,
    dimension,
    polarity: polarity as PreferenceMemory['polarity'],
    confidence: 1,
    source: 'explicit',
    active: true,
    evidence: [{ text: evidence, at: NOW, source: 'explicit' }],
    positiveCount: 1,
    negativeCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const preferences: Preferences = {
  id: 'current',
  flavorPreferences: ['甜口', '甜食'],
  avoidIngredients: ['香菜'],
  theme: 'cream-orange-green',
  fontScale: 'normal',
  dataVersion: 1,
};

test('口味记忆：开始烹饪页与偏好页使用同一套标签，旧版偏好标签也会显示', () => {
  const memories = [
    memory('spiciness', -2, '少辣'),
    memory('sweetness', 1, '甜一点'),
    memory('disliked_ingredient', -2, '不吃香菜'),
  ];

  expect(activeMemoryNotes(memories, preferences)).toEqual([
    '少辣',
    '甜一点',
    '避开香菜',
    '喜欢甜口',
    '喜欢甜食',
  ]);

  // 已经由结构化记忆卡片展示的“避开香菜”不重复出现在旧版标签里。
  expect(extraPreferenceTags(memories, preferences)).toEqual([
    { kind: 'liked', value: '甜口', label: '喜欢甜口' },
    { kind: 'liked', value: '甜食', label: '喜欢甜食' },
  ]);
});

test('口味记忆：旧版标签已带“喜欢”前缀时不会重复拼接', () => {
  const memories: PreferenceMemory[] = [];
  expect(
    activeMemoryNotes(memories, {
      ...preferences,
      flavorPreferences: ['喜欢甜口'],
      avoidIngredients: [],
    }),
  ).toEqual(['喜欢甜口']);
});

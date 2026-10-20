import { beforeEach, describe, expect, test } from 'vitest';
import { linesForTag } from '../content/mascotLines';
import {
  isAcceptableBanter,
  lastLineId,
  pickLine,
  resetMascotState,
  seedPool,
  storeBanter,
  takeAiLine,
  usedCount,
} from '../services/mascotService';

beforeEach(() => {
  resetMascotState();
});

describe('抽句：每次必须换一句', () => {
  test('连续抽 30 次都不会和上一句相同', () => {
    let previous = '';
    for (let i = 0; i < 30; i += 1) {
      const line = pickLine({ tag: 'click', avoidId: previous || undefined, preferAi: false });
      expect(line.text).not.toBe(previous);
      previous = line.text;
    }
  });

  test('会记录上一句，供下一次避开', () => {
    const line = pickLine({ tag: 'click', preferAi: false });
    expect(lastLineId()).toBe(line.id);
  });

  test('轮换：把点击桶说完后会重置，不会卡住', () => {
    const total = linesForTag('click').length;
    for (let i = 0; i < total; i += 1) {
      pickLine({ tag: 'click', preferAi: false });
    }
    // 一轮说完，已用计数应该恰好等于桶大小
    expect(usedCount('click')).toBe(total);
    // 再抽一次会触发重置，然后开始新一轮
    pickLine({ tag: 'click', preferAi: false });
    expect(usedCount('click')).toBe(1);
  });
});

describe('AI 话术过滤', () => {
  test('接受正常短句', () => {
    expect(isAcceptableBanter('锅热了，心也要热起来')).toBe(true);
  });

  test('拒绝过短、过长、说教、非中文', () => {
    expect(isAcceptableBanter('好')).toBe(false);
    expect(
      isAcceptableBanter('这句话实在是太长了长到气泡根本放不下还会溢出而且还继续写下去'),
    ).toBe(false);
    expect(isAcceptableBanter('你应该少放点盐')).toBe(false);
    expect(isAcceptableBanter('今天也要少摄入热量哦')).toBe(false);
    expect(isAcceptableBanter('hello 厨房')).toBe(false);
  });

  test('入库时去重，并跳过与语料重复的句子', () => {
    const corpusLine = linesForTag('click')[0].text;
    const added = storeBanter('click', [corpusLine, '锅铲一响，猫就上场', '锅铲一响，猫就上场']);
    expect(added).toBe(1);
    // 再存同样内容不会重复入库
    expect(storeBanter('click', ['锅铲一响，猫就上场'])).toBe(0);
  });
});

describe('AI 话术池', () => {
  test('优先使用 AI 池里的句子，取走即移除', () => {
    seedPool('click', ['锅铲一响，猫就上场']);
    const line = pickLine({ tag: 'click', preferAi: true });
    expect(line.id.startsWith('ai-')).toBe(true);
    expect(line.text).toBe('锅铲一响，猫就上场');
    // 池已空，第二次就回到语料
    const next = pickLine({ tag: 'click', preferAi: true });
    expect(next.id.startsWith('ai-')).toBe(false);
  });

  test('只取 AI 句子时，池空返回 null 且不动用语料计数', () => {
    expect(takeAiLine('click')).toBeNull();
    expect(usedCount('click')).toBe(0);
  });
});

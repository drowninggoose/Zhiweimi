import { describe, expect, test } from 'vitest';
import {
  MASCOT_LINES,
  MASCOT_TAGS,
  linesForTag,
  type MascotTag,
} from '../content/mascotLines';

/** 每个场景期望的条数（点击最常用，所以最多）。 */
const EXPECTED: Record<MascotTag, number> = {
  greet: 25,
  click: 80,
  cooking: 45,
  done: 25,
  morning: 15,
  noon: 15,
  afternoon: 14,
  evening: 15,
  night: 25,
  followup: 25,
};

/** 说教腔与敏感话题，语料里不该出现。 */
const BANNED = [/建议/, /应该/, /必须/, /一定要/, /热量/, /卡路里/, /减肥/, /营养/, /治疗/, /生病/];

describe('小猫语料库', () => {
  test('总量约 200 条', () => {
    expect(MASCOT_LINES.length).toBe(284);
  });

  test('每个场景条数符合规划', () => {
    for (const tag of MASCOT_TAGS) {
      expect(linesForTag(tag).length).toBe(EXPECTED[tag]);
    }
  });

  test('温暖与俏皮五五开', () => {
    const warm = MASCOT_LINES.filter((line) => line.tone === 'warm').length;
    const fun = MASCOT_LINES.filter((line) => line.tone === 'fun').length;
    expect(warm).toBe(142);
    expect(fun).toBe(142);
  });

  test('id 唯一', () => {
    const ids = new Set(MASCOT_LINES.map((line) => line.id));
    expect(ids.size).toBe(MASCOT_LINES.length);
  });

  test('句子长度适合气泡（4~18 字）', () => {
    for (const line of MASCOT_LINES) {
      expect(line.text.length).toBeGreaterThanOrEqual(4);
      expect(line.text.length).toBeLessThanOrEqual(18);
    }
  });

  test('没有说教腔与敏感话题', () => {
    for (const line of MASCOT_LINES) {
      for (const pattern of BANNED) {
        expect(pattern.test(line.text)).toBe(false);
      }
    }
  });

  test('文案不重复', () => {
    const texts = new Set(MASCOT_LINES.map((line) => line.text));
    expect(texts.size).toBe(MASCOT_LINES.length);
  });

  test('不出现食品安全风险表述', () => {
    // 例如鼓励吃焦糊、夹生的内容
    const risky = [/糊了也/, /焦的也能吃/, /夹生也行/, /生一点没关系/];
    for (const line of MASCOT_LINES) {
      for (const pattern of risky) {
        expect(pattern.test(line.text)).toBe(false);
      }
    }
  });
});

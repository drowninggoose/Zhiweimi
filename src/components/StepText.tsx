import type { ReactNode } from 'react';
import type { RecipeIngredient } from '../types/models';
import { isSeasoning } from '../services/ingredientGroups';

const HEAT_TERMS = ['中小火', '中大火', '大火', '中火', '小火', '文火', '旺火', '微火'];

const COMMON_SEASONINGS = [
  '生抽',
  '老抽',
  '酱油',
  '蚝油',
  '料酒',
  '香醋',
  '陈醋',
  '米醋',
  '食盐',
  '盐',
  '白糖',
  '冰糖',
  '红糖',
  '糖',
  '胡椒粉',
  '胡椒',
  '花椒',
  '辣椒',
  '豆瓣酱',
  '番茄酱',
  '淀粉',
  '生粉',
  '香油',
  '食用油',
  '色拉油',
];

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 步骤里把调料、火候和食材换成主色系高亮：
 * 调料 = 暖陶红；火候 = 赤陶橙；食材 = 鼠尾草绿。
 */
export function StepText({
  text,
  ingredients,
}: {
  text: string;
  ingredients: RecipeIngredient[];
}): ReactNode {
  const terms = new Map<string, 'seasoning' | 'heat' | 'ingredient'>();
  for (const item of ingredients) {
    if (!item.name) continue;
    terms.set(item.name, isSeasoning(item) ? 'seasoning' : 'ingredient');
  }
  for (const name of COMMON_SEASONINGS) {
    if (!terms.has(name)) terms.set(name, 'seasoning');
  }
  for (const name of HEAT_TERMS) terms.set(name, 'heat');

  const list = [...terms.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return text;

  const pattern = new RegExp(`(${list.map(escape).join('|')})`, 'g');
  return (
    <>
      {text.split(pattern).map((part, index) => {
        const kind = terms.get(part);
        if (!kind) return part;
        return (
          <mark className={`step-mark step-mark-${kind}`} key={`${part}-${index}`}>
            {part}
          </mark>
        );
      })}
    </>
  );
}

// @vitest-environment node
import { expect, test } from 'vitest';
import { exportBackup, parseBackup } from '../services/backupService';
import { defaultPreferences } from '../db/seed';
import { fixtureRecipes } from './fixtures';
import { stamp, type DataSnapshot } from '../types/models';
const snapshot: DataSnapshot = {
  recipes: fixtureRecipes(),
  utensils: [],
  diaryEntries: [],
  mealPlans: [],
  pantryItems: [],
  preferences: defaultPreferences,
  demoState: { id: 'current', version: 1, recentRecipeIds: [], recentRecommendationIds: [] },
};
test('阶段9/10：损坏图片、重复日期餐次、不存在菜谱引用与非法日期拒绝', async () => {
  const text = await exportBackup(snapshot);
  for (const mutate of [
    (s: DataSnapshot) => {
      s.utensils = [
        {
          ...stamp(),
          name: '坏图',
          type: 'cup',
          capacity: 100,
          capacityUnit: 'ml',
          image: {
            id: 'x',
            blob: 'data:image/png;base64,!!!!' as unknown as Blob,
            mimeType: 'image/png',
            width: 1,
            height: 1,
            size: 4,
          },
        },
      ];
    },
    (s: DataSnapshot) => {
      const entry = {
        ...stamp(),
        date: '2026-10-11',
        mealType: 'lunch' as const,
        dishName: '重复',
      };
      s.diaryEntries = [entry, { ...entry, ...stamp() }];
    },
    (s: DataSnapshot) => {
      s.diaryEntries = [
        {
          ...stamp(),
          date: '2026-10-11',
          mealType: 'lunch',
          dishName: '错误引用',
          recipeId: 'missing',
        },
      ];
    },
    (s: DataSnapshot) => {
      s.diaryEntries = [
        { ...stamp(), date: '2026-02-30', mealType: 'lunch', dishName: '错误日期' },
      ];
    },
  ]) {
    const backup = JSON.parse(text);
    mutate(backup.data);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  }
});
test('阶段9/10：含菜谱库（library）菜谱的备份可以原样导入', async () => {
  const [first] = fixtureRecipes();
  const withLibrary: DataSnapshot = {
    ...snapshot,
    recipes: [
      first,
      {
        ...first,
        id: 'lib-1',
        name: '青椒五花肉',
        sourceType: 'library',
        coverUrl: 'https://i3r.meishitx.com/atta/recipe/x.jpg',
        source: '美食天下',
        sourceUrl: 'https://home.meishichina.com/recipe-667891.html',
      },
    ],
  };
  const parsed = parseBackup(await exportBackup(withLibrary));
  expect(parsed.recipes.map((r) => r.sourceType)).toContain('library');
  expect(parsed.recipes).toHaveLength(2);
});

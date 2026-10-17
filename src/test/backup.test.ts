// @vitest-environment node
import { beforeEach, afterEach, expect, test } from 'vitest';
import { Database } from '../db/database';
import { createRepositories } from '../db/repositories';
import { initialize } from '../db/seed';
import { exportBackup, parseBackup } from '../services/backupService';
import { stamp } from '../types/models';
import { fixtureRecipes } from './fixtures';
const database = new Database('backup-tests');
const repo = createRepositories(database);
beforeEach(async () => {
  await database.open();
  await initialize(database);
  // 测试环境没有真实服务器，菜谱库导入会失败，手动塞一道菜谱库菜谱
  await database.recipes.bulkAdd(fixtureRecipes().slice(0, 1));
});
afterEach(() => database.delete());
test('阶段9：包含上传Blob图片的备份→全部清空→恢复保持内容，导出不修改数据', async () => {
  const blob = new Blob(['actual-image-bytes'], { type: 'image/png' });
  const image = {
    id: 'image-1',
    blob,
    mimeType: blob.type,
    width: 10,
    height: 10,
    size: blob.size,
  };
  await repo.utensils.create({
    ...stamp(),
    name: '图片杯',
    type: 'cup',
    capacity: 200,
    capacityUnit: 'ml',
    image,
  });
  const before = await repo.snapshot();
  const exported = await exportBackup(before);
  expect((await repo.snapshot()).utensils).toEqual(before.utensils);
  const parsed = parseBackup(exported);
  expect(await parsed.utensils[0].image!.blob.text()).toBe('actual-image-bytes');
  expect(parsed.utensils[0].image!.blob.type).toBe('image/png');
  await repo.clear('all');
  expect(await repo.recipes.list()).toEqual([]);
  await repo.restore(parsed);
  const restored = await repo.snapshot();
  expect(restored.recipes).toEqual(before.recipes);
  expect(await restored.utensils[0].image!.blob.text()).toBe('actual-image-bytes');
});
test('阶段9：坏JSON、版本、缺字段、错误类型、重复ID与非法图片全部拒绝且原数据保持', async () => {
  const text = await exportBackup(await repo.snapshot());
  const valid = JSON.parse(text);
  const invalids = [
    '{',
    JSON.stringify({ ...valid, format: 'other' }),
    JSON.stringify({ ...valid, backupVersion: 99 }),
    JSON.stringify({ ...valid, data: {} }),
  ];
  for (const mutate of [
    (b: typeof valid) => {
      b.data.recipes[0].favorite = 'yes';
    },
    (b: typeof valid) => {
      b.data.recipes.push(b.data.recipes[0]);
    },
    (b: typeof valid) => {
      b.data.preferences.fontScale = 'huge';
    },
    (b: typeof valid) => {
      b.data.utensils = [{ ...stamp(), name: 'bad', type: 'cup', capacity: 0, capacityUnit: 'ml' }];
    },
  ]) {
    const copy = JSON.parse(text);
    mutate(copy);
    invalids.push(JSON.stringify(copy));
  }
  for (const text of invalids) {
    expect(() => parseBackup(text)).toThrow();
    expect(await database.recipes.count()).toBe(1);
  }
});
test('阶段9：恢复事务中途失败会回滚，原菜谱仍完整', async () => {
  const snapshot = await repo.snapshot();
  const bad = {
    ...snapshot,
    utensils: [
      {
        ...stamp(),
        id: 'same',
        name: '杯',
        type: 'cup' as const,
        capacity: 200,
        capacityUnit: 'ml' as const,
      },
      {
        ...stamp(),
        id: 'same',
        name: '碗',
        type: 'bowl' as const,
        capacity: 300,
        capacityUnit: 'ml' as const,
      },
    ],
  };
  await expect(repo.restore(bad)).rejects.toThrow();
  expect(await database.recipes.count()).toBe(1);
  expect(await database.utensils.count()).toBe(0);
});

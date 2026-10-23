import type { DataSnapshot } from '../types/models';
export type Backup = {
  format: 'zhiweimi-backup';
  backupVersion: 1;
  appVersion: string;
  exportedAt: string;
  data: unknown;
};
type JsonRecord = Record<string, unknown>;
function object(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('备份字段必须为对象');
  return value as JsonRecord;
}
function string(value: unknown, label: string, empty = false): asserts value is string {
  if (typeof value !== 'string' || (!empty && !value.trim())) throw new Error(`备份${label}无效`);
}
function strings(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw new Error(`备份${label}必须为字符串数组`);
}
function optionalStrings(record: JsonRecord, keys: string[]) {
  for (const key of keys) if (record[key] !== undefined) string(record[key], key, true);
}
function oneOf(value: unknown, values: string[], label: string) {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`备份${label}无效`);
}
function number(value: unknown, label: string, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min)
    throw new Error(`备份${label}无效`);
}
function date(value: unknown, label: string) {
  string(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(`备份${label}无效`);
}
function base(value: unknown) {
  const r = object(value);
  string(r.id, 'ID');
  for (const key of ['createdAt', 'updatedAt']) {
    string(r[key], key);
    if (Number.isNaN(Date.parse(r[key] as string))) throw new Error('备份时间无效');
  }
  return r;
}
function image(value: unknown) {
  if (value === undefined) return;
  const r = object(value);
  string(r.id, '图片ID');
  oneOf(r.mimeType, ['image/jpeg', 'image/png', 'image/webp'], '图片类型');
  number(r.width, '图片宽度', 1);
  number(r.height, '图片高度', 1);
  number(r.size, '图片大小', 1);
  string(r.blob, '图片数据');
  const prefix = `data:${r.mimeType};base64,`;
  if (!r.blob.startsWith(prefix)) throw new Error('备份图片数据格式错误');
  const encoded = r.blob.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error('备份图片编码错误');
  if (atob(encoded).length !== r.size) throw new Error('备份图片大小不一致');
}
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${value.type};base64,${btoa(binary)}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(value))
      if (child !== undefined) result[key] = await encode(child);
    return result;
  }
  return value;
}
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'blob' && typeof child === 'string') {
        const [prefix, content] = child.split(',');
        const binary = atob(content);
        result[key] = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
          type: prefix.slice(5, -7),
        });
      } else result[key] = decode(child);
    }
    return result;
  }
  return value;
}
export async function exportBackup(snapshot: DataSnapshot) {
  const backup: Backup = {
    format: 'zhiweimi-backup',
    backupVersion: 1,
    appVersion: '0.1.0',
    exportedAt: new Date().toISOString(),
    data: await encode(snapshot),
  };
  return JSON.stringify(backup, null, 2);
}
export function parseBackup(text: string): DataSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是有效的 JSON 备份');
  }
  const backup = object(parsed);
  if (backup.format !== 'zhiweimi-backup') throw new Error('备份文件标识错误');
  if (backup.backupVersion !== 1) throw new Error('不支持此备份版本');
  string(backup.appVersion, '应用版本');
  string(backup.exportedAt, '导出日期');
  if (Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('备份导出日期无效');
  const data = object(backup.data);
  for (const key of ['recipes', 'utensils', 'diaryEntries', 'mealPlans', 'pantryItems']) {
    if (!Array.isArray(data[key])) throw new Error(`备份缺少${key}数组`);
    const ids = new Set<string>();
    for (const value of data[key] as unknown[]) {
      const r = base(value);
      if (ids.has(r.id as string)) throw new Error('备份存在重复ID');
      ids.add(r.id as string);
    }
  }
  for (const value of data.recipes as unknown[]) {
    const r = base(value);
    optionalStrings(r, ['notes']);
    string(r.name, '菜名');
    for (const key of ['cuisines', 'ingredientTags', 'flavorTags']) strings(r[key], key);
    strings(r.mealTypes, '餐次');
    for (const meal of r.mealTypes as string[])
      oneOf(meal, ['breakfast', 'lunch', 'dinner'], '餐次');
    oneOf(r.sourceType, ['demo', 'user', 'library'], '菜谱来源');
    oneOf(r.status, ['draft', 'published'], '菜谱状态');
    if (typeof r.favorite !== 'boolean') throw new Error('备份收藏状态无效');
    if (r.difficulty !== undefined) oneOf(r.difficulty, ['easy', 'normal', 'advanced'], '难度');
    if (r.estimatedMinutes !== undefined) number(r.estimatedMinutes, '用时', 1);
    image(r.coverImage);
    if (
      r.coverUrl !== undefined &&
      !(
        typeof r.coverUrl === 'string' &&
        (/^\/demo-images\/dish-[1-4]\.svg$/.test(r.coverUrl) || /^https?:\/\//.test(r.coverUrl))
      )
    )
      throw new Error('备份图片路径无效');
    for (const key of ['ingredients', 'steps'])
      if (!Array.isArray(r[key])) throw new Error(`备份缺少${key}`);
    for (const value of r.ingredients as unknown[]) {
      const i = object(value);
      optionalStrings(i, ['note']);
      string(i.id, '食材ID');
      string(i.name, '食材名称', r.status === 'draft');
      if (i.amount !== undefined) {
        if (typeof i.amount === 'number') number(i.amount, '食材数量');
        else if (i.amount !== '') string(i.amount, '食材数量');
      }
      if (i.unit !== undefined) string(i.unit, '食材单位', true);
    }
    for (const value of r.steps as unknown[]) {
      const s = object(value);
      string(s.id, '步骤ID');
      string(s.instruction, '步骤说明', r.status === 'draft');
      number(s.order, '步骤顺序', 1);
      image(s.image);
    }
    if (
      r.status === 'published' &&
      (!(r.ingredients as unknown[]).length || !(r.steps as unknown[]).length)
    )
      throw new Error('正式菜谱缺少食材或步骤');
  }
  for (const value of data.utensils as unknown[]) {
    const r = base(value);
    string(r.name, '厨具名称');
    oneOf(
      r.type,
      [
        'seasoning-spoon',
        'tablespoon',
        'bowl',
        'cup',
        'rice-cup',
        'pot',
        'pan',
        'wok',
        'baking-dish',
        'other',
      ],
      '厨具类型',
    );
    number(r.capacity, '容量', Number.MIN_VALUE);
    if (r.capacityUnit !== 'ml') throw new Error('备份容量单位无效');
    image(r.image);
  }
  const recipeIds = new Set((data.recipes as JsonRecord[]).map((r) => r.id));
  const slots = new Set<string>();
  for (const value of data.diaryEntries as unknown[]) {
    const r = base(value);
    optionalStrings(r, ['tasteRating', 'notes', 'adjustmentNotes', 'imageUrl']);
    date(r.date, '日记日期');
    oneOf(r.mealType, ['breakfast', 'lunch', 'dinner'], '餐次');
    string(r.dishName, '日记菜名');
    image(r.image);
    if (r.recipeId !== undefined && !recipeIds.has(r.recipeId))
      throw new Error('备份日记引用不存在的菜谱');
    const slot = `${r.date}-${r.mealType}`;
    if (slots.has(slot)) throw new Error('备份有重复日期餐次');
    slots.add(slot);
  }
  for (const value of data.pantryItems as unknown[]) {
    const r = base(value);
    optionalStrings(r, ['unit']);
    string(r.name, '食材名称');
    string(r.category, '食材类别', true);
    oneOf(r.status, ['available', 'used-up', 'discarded'], '食材状态');
    if (r.quantity !== undefined) number(r.quantity, '食材数量');
  }
  for (const value of data.mealPlans as unknown[]) {
    const r = base(value);
    optionalStrings(r, ['warning']);
    oneOf(r.period, ['today', 'week', 'month'], '计划周期');
    date(r.startDate, '计划开始日期');
    date(r.endDate, '计划结束日期');
    const c = object(r.conditions);
    strings(c.flavors, '计划口味');
    strings(c.avoidIngredients, '计划忌口');
    if (typeof c.preferPantry !== 'boolean') throw new Error('备份食材优先条件无效');
    if (c.maxMinutes !== undefined) number(c.maxMinutes, '最大用时', 1);
    if (c.difficulty !== undefined) oneOf(c.difficulty, ['easy', 'normal', 'advanced'], '计划难度');
    if (!Array.isArray(r.days) || !r.days.length) throw new Error('备份计划日期缺失');
    const dates = new Set();
    for (const value of r.days) {
      const d = object(value);
      date(d.date, '计划日期');
      if (
        (d.date as string) < (r.startDate as string) ||
        (d.date as string) > (r.endDate as string)
      )
        throw new Error('备份计划日期超出范围');
      if (dates.has(d.date)) throw new Error('备份计划日期重复');
      dates.add(d.date);
      for (const key of ['breakfastRecipeId', 'lunchRecipeId', 'dinnerRecipeId'])
        if (d[key] !== undefined && !recipeIds.has(d[key]))
          throw new Error('备份计划引用不存在的菜谱');
    }
    const first = (r.days[0] as JsonRecord).date;
    const last = (r.days.at(-1) as JsonRecord).date;
    if (first !== r.startDate || last !== r.endDate) throw new Error('备份计划起止日期不一致');
  }
  const p = object(data.preferences);
  if (
    p.id !== 'current' ||
    !['cream-orange-green', 'sage-green-cream', 'tomato-orange-cream'].includes(
      p.theme as string,
    ) ||
    p.dataVersion !== 1
  )
    throw new Error('备份偏好设置无效');
  strings(p.flavorPreferences, '口味偏好');
  strings(p.avoidIngredients, '忌口');
  oneOf(p.fontScale, ['small', 'normal', 'large'], '字号');
  if (p.defaultDifficulty !== undefined)
    oneOf(p.defaultDifficulty, ['easy', 'normal', 'advanced'], '默认难度');
  const state = object(data.demoState);
  if (state.id !== 'current' || state.version !== 1) throw new Error('备份演示状态无效');
  strings(state.recentRecipeIds, '最近查看');
  strings(state.recentRecommendationIds, '最近推荐');
  return decode(data) as DataSnapshot;
}
export function downloadBackup(text: string, date: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `知味咪-${date}.zhiweimi-backup.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

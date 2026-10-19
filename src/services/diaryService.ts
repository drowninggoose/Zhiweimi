import type { DiaryEntry } from '../types/models';
import { meals } from '../types/models';
export function diaryRows(entries: DiaryEntry[], from?: string, to?: string) {
  const dates = new Set(
    entries
      .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      .map((e) => e.date),
  );
  if (to) dates.add(to);
  if (from) dates.add(from);
  return [...dates]
    .sort()
    .reverse()
    .map((date) => ({
      date,
      slots: meals.map((meal) => ({
        meal,
        entry: entries.find((e) => e.date === date && e.mealType === meal),
      })),
    }));
}
export function validateDiary(entry: DiaryEntry) {
  if (!entry.dishName.trim()) throw new Error('请填写菜名');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    new Date(`${entry.date}T12:00:00`).toISOString().slice(0, 10) !== entry.date
  )
    throw new Error('请选择有效日期');
  if (!meals.includes(entry.mealType)) throw new Error('请选择餐次');
}

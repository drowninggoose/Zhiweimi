/**
 * 烹饪进度的自动保存与恢复。
 *
 * 解决的问题：以前离开烹饪页面，做到第几步、补救选择、日记草稿全部丢失，
 * 想利用炖煮的等待时间去浏览别的功能就得放弃进度。
 *
 * 现在的行为：
 * - 每次改动（翻步骤 / 选补救 / 写心得 / 传照片）都会防抖写入 IndexedDB；
 * - 离开页面、组件卸载前会把最后一次改动落盘；
 * - 再次进入同一道菜时自动恢复到上次的位置，并提示「上次做到第几步」；
 * - 保存到日记或点「仅完成」后删除该菜的进度记录。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import type { CookingProgress } from '../types/models';

export type CookingStage = 'steps' | 'complete';

export type CookingDraft = Omit<
  CookingProgress,
  'id' | 'createdAt' | 'updatedAt' | 'savedAt' | 'recipeId' | 'recipeName'
>;

export type CookingProgressHandle = {
  /** 读取进度完成前为 true，避免用空状态覆盖已保存的进度。 */
  loading: boolean;
  /** 本次进入是否从已保存的进度恢复。 */
  restored: boolean;
  /** 上次保存的时间（ISO），没有进度时为 undefined。 */
  savedAt?: string;
  /** 读到的历史进度，用于恢复各字段初值。 */
  initial: CookingProgress | null;
  /** 保存一次（内部已做防抖，可频繁调用）。 */
  save: (draft: CookingDraft) => void;
  /** 立即落盘并等待完成，用于离开页面前。 */
  flush: () => Promise<void>;
  /** 删除这道菜的进度（完成或放弃时调用）。 */
  discard: () => Promise<void>;
};

/** 把进度保存时间转成「几分钟前」这类友好文案。 */
export function formatSavedAgo(iso: string | undefined, now = Date.now()) {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/**
 * @param recipeId 当前菜谱 id；为空时不做任何保存。
 */
export function useCookingProgress(recipeId: string | undefined): CookingProgressHandle {
  const { data, refresh } = useData();
  const recipeName = data?.recipes.find((r) => r.id === recipeId)?.name ?? '';
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [initial, setInitial] = useState<CookingProgress | null>(null);
  /** 最新的待写入内容，卸载时用它兜底落盘。 */
  const pending = useRef<CookingDraft | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** 完成后不再回写，避免刚保存到日记又被进度记录覆盖回来。 */
  const stopped = useRef(false);

  // 读取进度：所有状态更新都发生在异步回调里，避免 effect 内同步 setState
  useEffect(() => {
    let active = true;
    if (!recipeId) return;
    repositories.cookingProgress
      .get(recipeId)
      .catch(() => null)
      .then((found) => {
        if (!active) return;
        if (found) {
          setInitial(found);
          setRestored(true);
          setSavedAt(found.savedAt);
        } else {
          setInitial(null);
          setRestored(false);
          setSavedAt(undefined);
        }
        setLoadedFor(recipeId);
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  const loading = loadedFor !== recipeId;

  const write = useCallback(async () => {
    const draft = pending.current;
    if (!recipeId || !draft || stopped.current) return;
    const now = new Date().toISOString();
    const existing = await repositories.cookingProgress.get(recipeId);
    // 等待读取期间可能已经完成并清理了进度，这里再确认一次
    if (stopped.current) return;
    const value: CookingProgress = {
      id: existing?.id ?? `progress-${recipeId}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      savedAt: now,
      recipeId,
      recipeName,
      stage: draft.stage,
      stepIndex: draft.stepIndex,
      completed: draft.completed,
      utensilChoices: draft.utensilChoices,
      problem: draft.problem,
      rating: draft.rating,
      notes: draft.notes,
      date: draft.date,
      mealType: draft.mealType,
      image: draft.image,
    };
    await repositories.cookingProgress.save(value);
    setSavedAt(now);
  }, [recipeId, recipeName]);

  /** 立即落盘（不等防抖）。 */
  const flush = useCallback(async () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    await write();
  }, [write]);

  const save = useCallback(
    (draft: CookingDraft) => {
      pending.current = draft;
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        void write();
      }, 600);
    },
    [write],
  );

  /**
   * 结束这段烹饪：先立标记阻止后续写入，再删除记录。
   * 组件卸载时的兜底写入不会把它又写回来。
   */
  const discard = useCallback(async () => {
    stopped.current = true;
    pending.current = null;
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (recipeId) await repositories.cookingProgress.remove(recipeId);
    setSavedAt(undefined);
    setRestored(false);
    await refresh();
  }, [recipeId, refresh]);

  // 组件卸载 / 切到别的菜时，把还没写入的最后一次改动落盘。
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
      void write();
    },
    [write],
  );

  return { loading, restored, savedAt, initial, save, flush, discard };
}

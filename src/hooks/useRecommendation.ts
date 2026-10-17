/**
 * 「今日推荐」的数据钩子。
 *
 * 行为约定：
 * - 每次打开页面（每次登录 / 重开浏览器）都会换一个种子，所以推荐内容不一样；
 * - 点「刷新 / 换一批」立刻换种子，并把刚推过的菜记入历史，下次优先避开；
 * - 页面停留时每分钟对表，跨过 9:00 / 14:00 自动切换早 / 午 / 晚餐；
 * - 用户手动点早餐 / 午餐 / 晚餐时，按手动选的餐次推荐。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import {
  buildRecommendation,
  windowDateInfo,
  type MealWindowKey,
  type RecommendationBatch,
} from '../services/recommendationService';

type EnsureResult = Awaited<ReturnType<typeof repositories.recommendationState.ensure>>;

/** 每次打开页面都不同的种子：时间段 + 打开时刻 + 一点随机。 */
function openSeed(windowKey: string) {
  const now = new Date();
  return `${windowKey}-o${now.getHours()}${now.getMinutes()}${now.getSeconds()}${Math.floor(
    Math.random() * 1e6,
  )}`;
}

/** 生成「打开页面时的种子」，并保证换时段后种子跟着换。 */
function nextSeed(prev: { info: { windowId: string }; seed: string }, windowId: string) {
  if (prev.info.windowId === windowId) return prev.seed;
  return openSeed(windowId);
}

export type RecommendationFeed = {
  batch: RecommendationBatch | null;
  loading: boolean;
  error: string;
  /** 当前生效的餐次（用户手动选择优先）。 */
  meal: MealWindowKey;
  /** 是否为用户手动选择。 */
  manual: boolean;
  info: ReturnType<typeof windowDateInfo>;
  refreshing: boolean;
  /** 换一批。 */
  refresh: () => void;
  /** 手动指定餐次；传 undefined 回到「跟随时间」。 */
  setMeal: (meal?: MealWindowKey) => void;
  /** 已经换过多少批。 */
  refreshCount: number;
};

export function useRecommendationFeed(): RecommendationFeed {
  const { data } = useData();
  const [mealOverride, setMealOverride] = useState<MealWindowKey | undefined>();
  const [clock, setClock] = useState(() => {
    const info = windowDateInfo();
    return { info, seed: openSeed(info.windowId) };
  });
  const [state, setState] = useState<EnsureResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const info = clock.info;

  // 每分钟对表：跨过 9:00 / 14:00 自动换餐次，并给这一时段一个新的打开种子。
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = windowDateInfo();
      setClock((prev) => ({ info: next, seed: nextSeed(prev, next.windowId) }));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // 读取数据库里的刷新现场；换了时间段会自动重置种子。
  useEffect(() => {
    if (!data) return;
    let active = true;
    repositories.recommendationState
      .ensure()
      .then((result) => {
        if (active) {
          setState(result);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [data, info.windowId]);

  const conditions = useMemo(
    () => ({
      flavors: data?.preferences.flavorPreferences ?? [],
      avoidIngredients: data?.preferences.avoidIngredients ?? [],
      difficulty: data?.preferences.defaultDifficulty,
      preferPantry: true,
    }),
    [data?.preferences],
  );

  /** 最近一批推过的菜，用来让「换一批」有新鲜感（与忌口无关，忌口由条件过滤）。 */
  const seenIds = useMemo(() => state?.state.recentBatches.flatMap((b) => b.ids) ?? [], [state]);

  const batch = useMemo<RecommendationBatch | null>(() => {
    if (!data || !state) return null;
    const refreshCount = state.state.refreshCount;
    const seed = mealOverride
      ? `${clock.seed}-manual-${mealOverride}-${refreshCount}`
      : `${clock.seed}-b${refreshCount}`;
    return buildRecommendation(data.recipes, conditions, data.pantryItems, {
      seed,
      meal: mealOverride,
      seenIds,
    });
  }, [data, state, conditions, seenIds, mealOverride, clock.seed]);

  /** 换一批：记住刚推过的菜 → 换种子 → 重新计算。 */
  const refresh = useCallback(() => {
    if (!data || !batch) return;
    setRefreshing(true);
    void (async () => {
      try {
        const { state: current } = await repositories.recommendationState.ensure();
        await repositories.recommendationState.remember(current, batch);
        const next = await repositories.recommendationState.refresh();
        setState({ state: next, rotated: false });
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRefreshing(false);
      }
    })();
  }, [data, batch]);

  const setMeal = useCallback((next?: MealWindowKey) => {
    setMealOverride(next);
  }, []);

  return {
    batch,
    loading: !data || !state,
    error,
    meal: mealOverride ?? batch?.meal ?? info.meal,
    manual: Boolean(mealOverride),
    info,
    refreshing,
    refresh,
    setMeal,
    refreshCount: state?.state.refreshCount ?? 0,
  };
}

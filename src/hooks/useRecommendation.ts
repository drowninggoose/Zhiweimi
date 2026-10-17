/**
 * 「今日推荐」的数据钩子。
 *
 * 行为约定（按产品要求调整过）：
 * - **不按时段**：任何时候打开都是随机挑 6 道，差别只在种子；
 * - 每次打开页面（每次登录 / 重开浏览器）换一个种子，所以内容不一样；
 * - 点「换一批」立刻换种子，并把刚推过的菜记入历史，让下一批尽量避开；
 * - 抽取时按用户口味偏好加权，合口味的菜更容易被抽到。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { buildRandomPicks, type RandomBatch } from '../services/recommendationService';

type EnsureResult = Awaited<ReturnType<typeof repositories.recommendationState.ensure>>;

/** 每次打开页面都不同的种子。 */
function openSeed() {
  return `pick-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export type RecommendationFeed = {
  batch: RandomBatch | null;
  loading: boolean;
  error: string;
  refreshing: boolean;
  /** 换一批。 */
  refresh: () => void;
  /** 已经换过多少批。 */
  refreshCount: number;
};

export function useRecommendationFeed(): RecommendationFeed {
  const { data } = useData();
  const [seed] = useState(openSeed);
  const [state, setState] = useState<EnsureResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // 读取数据库里的刷新现场（换批次数用于让种子变化可持久）。
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
  }, [data]);

  const conditions = useMemo(
    () => ({
      flavors: data?.preferences.flavorPreferences ?? [],
      avoidIngredients: data?.preferences.avoidIngredients ?? [],
      difficulty: data?.preferences.defaultDifficulty,
      preferPantry: true,
    }),
    [data?.preferences],
  );

  /** 最近几批推过的菜，用来让「换一批」有新鲜感（不是忌口）。 */
  const seenIds = useMemo(() => state?.state.recentBatches.flatMap((b) => b.ids) ?? [], [state]);

  const batch = useMemo<RandomBatch | null>(() => {
    if (!data || !state) return null;
    return buildRandomPicks(data.recipes, conditions, data.pantryItems, {
      seed: `${seed}-b${state.state.refreshCount}`,
      count: 6,
      seenIds,
    });
  }, [data, state, conditions, seenIds, seed]);

  /** 换一批：记住刚推过的菜 → 换种子 → 重新计算。 */
  const refresh = useCallback(() => {
    if (!data || !batch) return;
    setRefreshing(true);
    void (async () => {
      try {
        const { state: current } = await repositories.recommendationState.ensure();
        // 记录本批 id，供下一批避开；RandomBatch 与旧接口结构不同，这里只取 id
        await repositories.recommendationState.remember(current, {
          windowId: 'any',
          meal: 'dinner',
          mealLabel: '随机',
          seed: batch.seed,
          candidateCount: batch.candidateCount,
          groups: [],
          dishes: batch.dishes,
        });
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

  return {
    batch,
    loading: !data || !state,
    error,
    refreshing,
    refresh,
    refreshCount: state?.state.refreshCount ?? 0,
  };
}

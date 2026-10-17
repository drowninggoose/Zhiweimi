/**
 * 推荐相关界面：时间段头、推荐中心、卡片流、卡片 / 列表两种浏览方式。
 * 推荐能力现在完整地放在首页（RecommendationCenter），不再有独立的推荐页。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { repositories } from '../db/repositories';
import { useData } from '../app/data';
import { useRecommendationFeed } from '../hooks/useRecommendation';
import { Image } from './common';
import {
  DIFFICULTY_LABELS,
  formatCountdown,
  formatIngredients,
  type RecommendedDish,
} from '../services/recommendationService';
import { meals, mealLabels, type MealType } from '../types/models';

const SLOT_ICONS: Record<string, string> = {
  main: '🍚',
  soup: '🍲',
  dessert: '🍰',
  light: '🥗',
  western: '🍝',
  breakfast: '🥣',
};

/** 时间段头部：现在该吃哪一餐 + 距离换时段还有多久 + 手动切换餐次 + 换一批。 */
export function MealWindowBar({
  mealLabel,
  windowLabel,
  windowRange,
  countdownMs,
  manual,
  loading,
  onSelect,
  onRefresh,
  batchInfo,
}: {
  mealLabel: string;
  windowLabel: string;
  windowRange: string;
  countdownMs: number;
  manual: boolean;
  loading: boolean;
  onSelect: (meal?: MealType) => void;
  onRefresh: () => void;
  batchInfo: string;
}) {
  return (
    <section className="card rec-head">
      <div className="row between">
        <div>
          <span className="tag">{manual ? '手动选择餐次' : windowLabel}</span>
          <h2 className="rec-title">现在推荐 · {mealLabel}</h2>
          <p className="muted">
            时段 {windowRange} · 距离换时段还有 {formatCountdown(countdownMs)} · {batchInfo}
          </p>
        </div>
        <button type="button" className="rec-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? '正在刷新…' : '🔄 换一批'}
        </button>
      </div>
      <div className="row rec-meals">
        <span className="muted">想吃别的？</span>
        <button
          type="button"
          className={manual ? 'secondary' : ''}
          onClick={() => onSelect(undefined)}
        >
          跟随时间
        </button>
        {meals.map((m) => (
          <button
            key={m}
            type="button"
            className={manual && mealLabel === mealLabels[m] ? '' : 'secondary'}
            aria-pressed={manual && mealLabel === mealLabels[m]}
            onClick={() => onSelect(m)}
          >
            {mealLabels[m]}
          </button>
        ))}
      </div>
    </section>
  );
}

/** 单张推荐卡片：图片 + 为什么推它 + 一眼看完的食材 + 收藏 / 开始烹饪。 */
export function RecommendationDishCard({ dish }: { dish: RecommendedDish }) {
  const { run } = useData();
  const recipe = dish.recipe;
  const [open, setOpen] = useState(false);
  const ingredients = formatIngredients(recipe.ingredients);
  const needsToggle = ingredients.length > 60;
  return (
    <article className="card rec-card">
      <Link className="rec-card-media" to={`/recipes/${recipe.id}`}>
        <Image image={recipe.coverImage} url={recipe.coverUrl} alt={recipe.name} />
        <span className="rec-slot-badge">
          {SLOT_ICONS[dish.slot] ?? '🍽️'} {dish.slotLabel}
        </span>
      </Link>
      <div className="rec-card-body">
        <h3>
          <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
        </h3>
        <div className="row rec-tags">
          {dish.reasons.map((reason) => (
            <span className="tag" key={reason}>
              👍 {reason}
            </span>
          ))}
          {recipe.estimatedMinutes ? (
            <span className="tag">⏱ {recipe.estimatedMinutes} 分钟</span>
          ) : null}
          {recipe.difficulty ? (
            <span className="tag">{DIFFICULTY_LABELS[recipe.difficulty]}</span>
          ) : null}
        </div>
        <p className="muted">
          {[...recipe.cuisines, ...recipe.flavorTags].slice(0, 4).join(' · ') || '家常风味'}
        </p>
        {recipe.description ? (
          <p className="rec-desc">
            {open || !needsToggle ? recipe.description : `${recipe.description.slice(0, 52)}…`}
            {needsToggle && (
              <button type="button" className="rec-more" onClick={() => setOpen(!open)}>
                {open ? '收起' : '展开'}
              </button>
            )}
          </p>
        ) : null}
        <p className="rec-ingredients">
          食材：{needsToggle && !open ? `${ingredients.slice(0, 60)}…` : ingredients}
        </p>
        <div className="row">
          <Link className="button" to={`/cook/${recipe.id}`}>
            开始烹饪
          </Link>
          <button
            type="button"
            className="secondary"
            aria-label={`${recipe.favorite ? '取消收藏' : '收藏'}${recipe.name}`}
            onClick={() => void run(() => repositories.recipes.favorite(recipe), '收藏已更新')}
          >
            {recipe.favorite ? '♥ 已收藏' : '♡ 收藏'}
          </button>
        </div>
      </div>
    </article>
  );
}

/** 单列「一屏一道」浏览：像刷小红书一样左右翻。 */
export function RecommendationCardDeck({ dishes }: { dishes: RecommendedDish[] }) {
  const [index, setIndex] = useState(0);
  const safeIndex = dishes.length ? Math.min(index, dishes.length - 1) : 0;
  const current = dishes[safeIndex];
  const atEnd = safeIndex >= dishes.length - 1;

  const step = (delta: number) => {
    setIndex((prev) => Math.min(Math.max(prev + delta, 0), Math.max(dishes.length - 1, 0)));
  };

  if (!current) return null;
  return (
    <section className="rec-deck" aria-label="今日推荐卡片流">
      <div className="row between">
        <span className="muted">
          第 {safeIndex + 1} / {dishes.length} 道 · 用 ← → 键翻看
        </span>
        <div className="row">
          <button
            type="button"
            className="secondary"
            aria-label="上一道推荐"
            disabled={safeIndex === 0}
            onClick={() => step(-1)}
          >
            ← 上一道
          </button>
          <button type="button" aria-label="下一道推荐" disabled={atEnd} onClick={() => step(1)}>
            下一道 →
          </button>
        </div>
      </div>
      <div
        className="rec-deck-stage"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <RecommendationDishCard dish={current} />
      </div>
      <div className="rec-dots">
        {dishes.map((d, i) => (
          <button
            key={d.recipe.id}
            type="button"
            className={i === safeIndex ? 'active' : ''}
            aria-label={`查看第 ${i + 1} 道推荐`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * 推荐中心：首页的推荐主体。
 *
 * 原本这是一个独立的「今日推荐」页面，为了不再和首页重复，已合并到这里。
 * 能力一个不少：按时间自动选餐次、手动切餐次、换一批（避开刚看过的菜）、
 * 卡片流（一屏一道左右翻）与按类型看（主菜 / 汤 / 甜品分组）。
 */
export function RecommendationCenter() {
  const feed = useRecommendationFeed();
  const [mode, setMode] = useState<'deck' | 'list'>('deck');
  if (feed.loading || !feed.batch) {
    return (
      <section className="card">
        <p className="muted">正在按当前时间为你挑菜…</p>
      </section>
    );
  }
  const { batch } = feed;
  const batchInfo = `${batch.mealLabel}候选 ${batch.candidateCount} 道 · 本批 ${batch.dishes.length} 道 · 已换 ${feed.refreshCount} 批`;
  return (
    <>
      <MealWindowBar
        mealLabel={batch.mealLabel}
        windowLabel={feed.info.windowLabel}
        windowRange={feed.info.windowRange}
        countdownMs={feed.info.countdownMs}
        manual={feed.manual}
        loading={feed.refreshing}
        onSelect={feed.setMeal}
        onRefresh={feed.refresh}
        batchInfo={batchInfo}
      />
      {feed.error ? (
        <p role="alert" className="error">
          刷新推荐失败：{feed.error}
        </p>
      ) : null}
      <p className="rec-disclaimer">
        <span className="tag">演示推荐</span> 按本地规则与你的口味偏好挑菜，不是真实 AI 生成。
      </p>
      {batch.note ? <p className="notice-line">ℹ️ {batch.note}</p> : null}
      <div className="row rec-view">
        <button
          type="button"
          className={mode === 'deck' ? '' : 'secondary'}
          onClick={() => setMode('deck')}
        >
          卡片流
        </button>
        <button
          type="button"
          className={mode === 'list' ? '' : 'secondary'}
          onClick={() => setMode('list')}
        >
          按类型看
        </button>
      </div>
      {batch.dishes.length === 0 ? (
        <>
          <section className="card empty">
            🍽️<p>{batch.fallback ?? '暂时没有可以推荐的菜谱。'}</p>
          </section>
          <RecipeQuickLinks />
        </>
      ) : mode === 'deck' ? (
        <RecommendationCardDeck dishes={batch.dishes} />
      ) : (
        <RecommendationFeed groups={batch.groups} />
      )}
      {batch.dishes.length && mode === 'deck' ? (
        <details className="card rec-peek">
          <summary>先看看这一批都有什么（{batch.dishes.length} 道）</summary>
          <div className="grid">
            {batch.dishes.map((dish) => (
              <RecommendationDishCard key={`peek-${dish.recipe.id}`} dish={dish} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

/** 推荐卡片流：处理「再看一些」的增量展示。 */
export function RecommendationFeed({
  groups,
  fallback,
}: {
  groups: { slot: string; label: string; dishes: RecommendedDish[] }[];
  fallback?: string;
}) {
  const [visible, setVisible] = useState(4);
  const total = groups.reduce((sum, g) => sum + g.dishes.length, 0);
  const shown: { slot: string; label: string; dishes: RecommendedDish[] }[] = [];
  let budget = visible;
  for (const group of groups) {
    if (budget <= 0) break;
    const take = Math.min(budget, group.dishes.length);
    budget -= take;
    if (take > 0)
      shown.push({ slot: group.slot, label: group.label, dishes: group.dishes.slice(0, take) });
  }
  const remaining = Math.max(0, total - visible);
  return (
    <>
      {shown.length ? (
        shown.map((group) => (
          <section className="rec-group" key={group.slot + group.label}>
            <h3 className="rec-group-title">{group.label}</h3>
            <div className="grid">
              {group.dishes.map((dish) => (
                <RecommendationDishCard key={dish.recipe.id} dish={dish} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="muted">{fallback ?? '暂时没有可以推荐的菜谱。'}</p>
      )}
      {remaining > 0 ? (
        <button type="button" onClick={() => setVisible(total)}>
          再看一些（还有 {remaining} 道）
        </button>
      ) : null}
    </>
  );
}

/** 找菜谱的兜底入口：推荐不出来时也能自己搜。 */
export function RecipeQuickLinks() {
  return (
    <p className="muted">
      也可以去 <Link to="/recipes">菜谱总览</Link> 自己挑，或在{' '}
      <Link to="/settings">数据与设置</Link> 里调整口味偏好与忌口。
    </p>
  );
}

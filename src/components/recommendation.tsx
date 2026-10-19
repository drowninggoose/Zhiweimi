/**
 * 推荐相关界面：推荐中心、卡片流、单张菜卡。
 *
 * 按产品要求做过减法：
 * - 不按时段推荐（随机挑 6 道，只受口味偏好影响）；
 * - 没有「演示推荐」标识、没有「卡片流 / 按类型看」切换、没有「先看看这一批」折叠区；
 * - 只保留「换一批」。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { repositories } from '../db/repositories';
import { useData } from '../app/data';
import { useRecommendationFeed } from '../hooks/useRecommendation';
import { Image } from './common';
import {
  DIFFICULTY_LABELS,
  formatIngredients,
  type RecommendedDish,
} from '../services/recommendationService';

const SLOT_ICONS: Record<string, string> = {
  main: '🍚',
  soup: '🍲',
  dessert: '🍰',
  light: '🥗',
  western: '🍝',
  breakfast: '🥣',
};

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

/** 推荐中心：首页的推荐主体。随机挑 6 道，随时可以换一批。 */
export function RecommendationCenter() {
  const feed = useRecommendationFeed();
  if (feed.loading || !feed.batch) {
    return (
      <section className="card">
        <p className="muted">正在挑选推荐…</p>
      </section>
    );
  }
  const { batch } = feed;
  return (
    <>
      <div className="row between rec-toolbar">
        <span className="muted">本批 {batch.dishes.length} 道 · 已换 {feed.refreshCount} 批</span>
        <button
          type="button"
          className="rec-refresh"
          onClick={feed.refresh}
          disabled={feed.refreshing}
        >
          {feed.refreshing ? '正在刷新…' : '🔄 换一批'}
        </button>
      </div>
      {feed.error ? (
        <p role="alert" className="error">
          刷新推荐失败：{feed.error}
        </p>
      ) : null}
      {batch.note ? <p className="notice-line">ℹ️ {batch.note}</p> : null}
      {batch.dishes.length === 0 ? (
        <>
          <section className="card empty">
            🍽️<p>{batch.fallback ?? '暂时没有可以推荐的菜谱。'}</p>
          </section>
          <RecipeQuickLinks />
        </>
      ) : (
        <RecommendationCardDeck dishes={batch.dishes} />
      )}
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecommendationFeed } from '../hooks/useRecommendation';
import { Image } from './common';
import type { RecommendedDish } from '../services/recommendationService';

/** 首页单图横幅轮播：只显示当前菜品照片，箭头覆盖在照片左右两侧。 */
export function RecommendationCardDeck({ dishes }: { dishes: RecommendedDish[] }) {
  const [index, setIndex] = useState(0);
  const safeIndex = dishes.length ? Math.min(index, dishes.length - 1) : 0;
  const current = dishes[safeIndex];
  const step = (delta: number) => {
    if (dishes.length < 2) return;
    setIndex((prev) => (prev + delta + dishes.length) % dishes.length);
  };

  if (!current) return null;
  return (
    <section
      className="rec-strip"
      aria-label="今日推荐图片轮播"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') step(-1);
        if (event.key === 'ArrowRight') step(1);
      }}
    >
      <button
        type="button"
        className="rec-strip-arrow rec-strip-arrow-left"
        aria-label="上一道推荐"
        disabled={dishes.length < 2}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <Link className="rec-strip-link" to={`/recipes/${current.recipe.id}`}>
        <Image
          image={current.recipe.coverImage}
          url={current.recipe.coverUrl}
          alt={current.recipe.name}
        />
        <strong className="rec-strip-title">{current.recipe.name}</strong>
      </Link>
      <button
        type="button"
        className="rec-strip-arrow rec-strip-arrow-right"
        aria-label="下一道推荐"
        disabled={dishes.length < 2}
        onClick={() => step(1)}
      >
        ›
      </button>
    </section>
  );
}

export function RecommendationCenter() {
  const feed = useRecommendationFeed();
  if (feed.loading || !feed.batch) return <p className="muted">正在挑选推荐…</p>;
  if (feed.error)
    return (
      <p role="alert" className="error">
        推荐加载失败：{feed.error}
      </p>
    );
  if (!feed.batch.dishes.length) return <p className="muted">暂时没有可以推荐的菜谱。</p>;
  return (
    <>
      <div className="row between rec-toolbar">
        <span className="muted">共 {feed.batch.dishes.length} 道</span>
        <button
          type="button"
          className="rec-refresh"
          onClick={feed.refresh}
          disabled={feed.refreshing}
        >
          {feed.refreshing ? '正在刷新…' : '🔄 换一批'}
        </button>
      </div>
      <RecommendationCardDeck dishes={feed.batch.dishes} />
    </>
  );
}

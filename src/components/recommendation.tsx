import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecommendationFeed } from '../hooks/useRecommendation';
import { Image } from './common';
import type { RecommendedDish } from '../services/recommendationService';

/** 首页单图横幅轮播：只显示当前菜品照片，箭头覆盖在照片左右两侧。 */
export function RecommendationCardDeck({ dishes }: { dishes: RecommendedDish[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const safeIndex = dishes.length ? Math.min(index, dishes.length - 1) : 0;
  const current = dishes[safeIndex];
  const step = (delta: number) => {
    if (dishes.length < 2) return;
    setIndex((prev) => (prev + delta + dishes.length) % dishes.length);
  };

  useEffect(() => {
    if (paused || dishes.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % dishes.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused, dishes.length]);

  if (!current) return null;
  return (
    <section
      className="rec-strip"
      aria-label="今日推荐图片轮播"
      aria-roledescription="轮播图"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
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
      <div className="rec-strip-dots" aria-label={`第 ${safeIndex + 1} 张，共 ${dishes.length} 张`}>
        {dishes.map((dish, dotIndex) => (
          <button
            key={dish.recipe.id}
            type="button"
            className={dotIndex === safeIndex ? 'active' : ''}
            aria-label={`查看第 ${dotIndex + 1} 道推荐：${dish.recipe.name}`}
            aria-current={dotIndex === safeIndex ? 'true' : undefined}
            onClick={() => setIndex(dotIndex)}
          />
        ))}
      </div>
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
  return <RecommendationCardDeck dishes={feed.batch.dishes} />;
}

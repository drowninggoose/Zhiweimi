import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { Image } from '../components/common';
import { RecommendationCenter } from '../components/recommendation';
import { ContinueCooking } from './Cooking';
import { today, meals, mealLabels } from '../types/models';

export function HomePage() {
  const { data } = useData();
  const [selected, setSelected] = useState('');
  if (!data) return null;
  const recent = data.demoState.recentRecipeIds
    .map((id) => data.recipes.find((r) => r.id === id))
    .filter((r) => r && r.status === 'published');
  const favorites = data.recipes.filter((r) => r.favorite && r.status === 'published');
  const available = data.recipes.filter((r) => r.status === 'published');
  const chosen = selected || recent[0]?.id || favorites[0]?.id || available[0]?.id;
  const entries = [...data.diaryEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const currentPlan = [...data.mealPlans]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((p) => p.days.some((d) => d.date === today()));
  const currentDay = currentPlan?.days.find((d) => d.date === today());
  return (
    <>
      <section className="hero">
        <div>
          <span className="tag">你好，今天也好好吃饭</span>
          <h2>今天想吃点什么？</h2>
        </div>
        <img className="hero-mascot" src="/mascot-cat.png" alt="知味咪厨师猫" />
      </section>
      <section className="card rec-home" id="today-recommendation">
        <h2>今日推荐</h2>
        <RecommendationCenter />
      </section>
      <ContinueCooking />
      <div className="grid home-sections">
        <section className="card">
          <h2>开始烹饪</h2>
          <label>
            选择一道菜
            <select
              aria-label="首页烹饪菜谱"
              value={chosen ?? ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              <optgroup label="最近查看">
                {recent.map(
                  (r) =>
                    r && (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ),
                )}
              </optgroup>
              <optgroup label="收藏菜谱">
                {favorites.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="其他菜谱">
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <p>
            <Link to="/cook">选择其他</Link>
          </p>
          {chosen ? (
            <Link className="button" to={`/cook/${chosen}`}>
              开始烹饪
            </Link>
          ) : (
            <Link to="/recipes/new">创建菜谱</Link>
          )}
        </section>
        <section className="card">
          <div className="row between">
            <h2>最近的美食日记</h2>
            <Link to="/diary">查看全部</Link>
          </div>
          {entries.length ? (
            entries.map((entry) => (
              <Link className="diary-summary" key={entry.id} to={`/diary?entry=${entry.id}`}>
                <Image image={entry.image} alt={entry.dishName} className="mini-plate" />
                <span>
                  {entry.dishName}
                  <small>
                    {entry.date} · {mealLabels[entry.mealType]}
                  </small>
                </span>
              </Link>
            ))
          ) : (
            <p>
              记下你今天的味道。<Link to="/diary">添加记录</Link>
            </p>
          )}
        </section>
        <section className="card">
          <h2>今日饮食计划</h2>
          {currentDay ? (
            meals.map((meal) => {
              const recipe = data.recipes.find((r) => r.id === currentDay[`${meal}RecipeId`]);
              return (
                <p key={meal}>
                  {mealLabels[meal]} · <Link to="/planner">{recipe?.name ?? '菜谱已移除'}</Link>
                </p>
              );
            })
          ) : (
            <p>
              还没有今日计划。<Link to="/planner">生成今日计划</Link>
            </p>
          )}
        </section>
      </div>
      <section className="card">
        <h2>让下厨更顺手</h2>
        <div className="row">
          <Link className="button secondary" to="/recipes/new">
            新建菜谱
          </Link>
          <Link className="button secondary" to="/utensils?new=1">
            添加厨具
          </Link>
          <Link className="button secondary" to="/planner/pantry?new=1">
            添加食材
          </Link>
          <Link className="button secondary" to="/planner">
            制定饮食计划
          </Link>
        </div>
      </section>
    </>
  );
}

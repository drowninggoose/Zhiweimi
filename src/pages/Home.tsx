import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { Image } from '../components/common';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { RecommendationCenter } from '../components/recommendation';
import { ContinueCooking } from './Cooking';
import { today, meals, mealLabels } from '../types/models';

export function HomePage() {
  const { data } = useData();
  if (!data) return null;
  const recent = data.demoState.recentRecipeIds
    .map((id) => data.recipes.find((r) => r.id === id))
    .filter((r) => r && r.status === 'published');
  const favorites = data.recipes.filter((r) => r.favorite && r.status === 'published');
  const available = data.recipes.filter((r) => r.status === 'published');
  const quick = recent[0] ?? favorites[0] ?? available[0];
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
        <img
          className="hero-mascot"
          src="/mascot/motion-v3/02-aroma-bowl.webp?v=3"
          alt="闻到料理香气的知味咪小猫"
          draggable={false}
        />
      </section>
      <section className="card rec-home" id="today-recommendation">
        <SectionTitle icon="heart">今日推荐</SectionTitle>
        <RecommendationCenter />
      </section>
      <ContinueCooking />
      <div className="grid home-sections">
        <section className="card home-panel home-panel-cook">
          <div className="home-panel-head">
            <h2>
              <span className="home-panel-icon" aria-hidden="true">
                <Icon name="flame" size={19} />
              </span>
              <span className="home-panel-title">开始烹饪</span>
            </h2>
          </div>
          <Link className="home-recipe-jump" to="/recipes" aria-label="选择一道菜，去全部菜谱">
            <span className="home-recipe-jump-copy">
              <strong>选择一道菜</strong>
              <small>打开全部菜谱，慢慢挑一道</small>
            </span>
            <Icon name="arrow-right" size={21} />
          </Link>
          {quick ? (
            <>
              <Link className="home-quick-dish" to={`/cook/${quick.id}`}>
                <Image
                  image={quick.coverImage}
                  url={quick.coverUrl}
                  alt={quick.name}
                  className="home-dish-plate is-small"
                />
                <span className="home-quick-copy">
                  <small>{recent[0] ? '上次想做' : quick.favorite ? '你的收藏' : '今日想试'}</small>
                  <strong>{quick.name}</strong>
                </span>
                <Icon name="arrow-right" size={18} />
              </Link>
              <Link className="button home-cook-start" to={`/cook/${quick.id}`}>
                开始烹饪
              </Link>
            </>
          ) : (
            <Link className="button home-cook-start" to="/recipes/new">
              创建第一道菜谱
            </Link>
          )}
        </section>
        <section className="card home-panel home-panel-diary">
          <div className="home-panel-head">
            <h2>
              <span className="home-panel-icon" aria-hidden="true">
                <Icon name="camera" size={19} />
              </span>
              <span className="home-panel-title">最近的美食日记</span>
            </h2>
          </div>
          {entries.length ? (
            <div className="home-diary-list">
              {entries.map((entry) => {
                const linked = data.recipes.find((r) => r.id === entry.recipeId);
                return (
                  <Link
                    className="diary-summary home-diary-row"
                    key={entry.id}
                    to={`/diary?entry=${entry.id}`}
                  >
                    <Image
                      image={entry.image ?? linked?.coverImage}
                      url={entry.imageUrl ?? linked?.coverUrl}
                      alt={entry.dishName}
                      className="home-dish-plate"
                    />
                    <span className="home-diary-copy">
                      <strong>{entry.dishName}</strong>
                      <small>
                        {entry.date} · {mealLabels[entry.mealType]}
                      </small>
                    </span>
                    <Icon name="arrow-right" size={18} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="home-panel-empty">
              <Image alt="空盘子" className="home-dish-plate" />
              <p>记下你今天的味道。</p>
            </div>
          )}
          <div className="home-panel-actions">
            <Link className="home-panel-action" to="/diary">
              查看全部
            </Link>
            <Link className="home-panel-action is-record" to="/diary">
              <Icon name="plus" size={15} />
              记录今天这一餐
            </Link>
          </div>
        </section>
        <section className="card home-panel home-panel-plan">
          <div className="home-panel-head">
            <h2>
              <span className="home-panel-icon" aria-hidden="true">
                <Icon name="calendar" size={19} />
              </span>
              <span className="home-panel-title">今日饮食计划</span>
            </h2>
          </div>
          {currentDay ? (
            <div className="home-plan-list">
              {meals.map((meal) => {
                const recipe = data.recipes.find((r) => r.id === currentDay[`${meal}RecipeId`]);
                return (
                  <Link className="home-plan-row" key={meal} to="/planner">
                    <Image
                      image={recipe?.coverImage}
                      url={recipe?.coverUrl}
                      alt={recipe?.name ?? '空盘子'}
                      className="home-dish-plate"
                    />
                    <span className="home-plan-copy">
                      <small>{mealLabels[meal]}</small>
                      <strong>{recipe?.name ?? '菜谱已移除'}</strong>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="home-panel-empty">
              <Image alt="空盘子" className="home-dish-plate" />
              <p>
                还没有今日计划。
                <Link to="/planner">生成今日计划</Link>
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

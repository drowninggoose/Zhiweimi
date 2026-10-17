import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { generatePlan, replaceMeal } from '../services/planningService';
import { Empty } from '../components/common';
import { today, meals, mealLabels, type MealPlan, type PlanConditions } from '../types/models';
export function PlannerPage() {
  const { data, run } = useData();
  const [period, setPeriod] = useState<MealPlan['period']>('today');
  const [start, setStart] = useState(today());
  const [conditions, setConditions] = useState<PlanConditions>(() => ({
    flavors: data?.preferences.flavorPreferences ?? [],
    avoidIngredients: data?.preferences.avoidIngredients ?? [],
    difficulty: data?.preferences.defaultDifficulty,
    preferPantry: true,
  }));
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [selected, setSelected] = useState(today());
  const [error, setError] = useState('');
  if (!data) return null;
  function generate() {
    try {
      const next = generatePlan(
        data!.recipes,
        data!.pantryItems,
        {
          ...conditions,
          flavors: conditions.flavors.map((s) => s.trim()).filter(Boolean),
          avoidIngredients: conditions.avoidIngredients.map((s) => s.trim()).filter(Boolean),
        },
        period,
        start,
        plan ?? undefined,
      );
      setPlan(next);
      setSelected(next.startDate);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function replace(date: string, meal: (typeof meals)[number]) {
    try {
      if (plan) setPlan(replaceMeal(plan, date, meal, data!.recipes, data!.pantryItems));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <div className="row between">
        <h2>把三餐安排得从容一点</h2>
        <Link className="button secondary" to="/planner/pantry">
          家庭食材
        </Link>
      </div>
      <section className="card fields">
        <span className="tag">演示计划</span>
        <div className="row">
          <label>
            计划周期
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as MealPlan['period'])}
            >
              <option value="today">今天</option>
              <option value="week">一周</option>
              <option value="month">一个月</option>
            </select>
          </label>
          <label>
            开始日期
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            口味偏好（逗号分隔）
            <input
              value={conditions.flavors.join(',')}
              onChange={(e) =>
                setConditions({
                  ...conditions,
                  flavors: e.target.value.split(/[,，]/),
                })
              }
            />
          </label>
          <label>
            忌口（逗号分隔）
            <input
              value={conditions.avoidIngredients.join(',')}
              onChange={(e) =>
                setConditions({
                  ...conditions,
                  avoidIngredients: e.target.value.split(/[,，]/),
                })
              }
            />
          </label>
          <label>
            最多分钟
            <input
              type="number"
              min="1"
              value={conditions.maxMinutes ?? ''}
              onChange={(e) =>
                setConditions({
                  ...conditions,
                  maxMinutes: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
          <label>
            难度
            <select
              value={conditions.difficulty ?? ''}
              onChange={(e) =>
                setConditions({ ...conditions, difficulty: e.target.value || undefined })
              }
            >
              <option value="">不限</option>
              <option value="easy">简单</option>
              <option value="normal">普通</option>
              <option value="advanced">进阶</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={conditions.preferPantry}
              onChange={(e) => setConditions({ ...conditions, preferPantry: e.target.checked })}
            />
            优先使用家庭食材
          </label>
        </div>
        <button onClick={generate}>生成演示计划</button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {plan ? (
        <section className="card">
          <div className="row between">
            <h2>
              {plan.startDate} — {plan.endDate}
            </h2>
            <div className="row">
              <button
                onClick={() =>
                  void run(
                    () =>
                      data.mealPlans.some((p) => p.id === plan.id)
                        ? repositories.mealPlans.update(plan)
                        : repositories.mealPlans.create(plan),
                    '计划已保存',
                  )
                }
              >
                保存计划
              </button>
              <button className="secondary" onClick={generate}>
                重新生成
              </button>
            </div>
          </div>
          {plan.warning && (
            <p role="status" className="muted">
              {plan.warning}
            </p>
          )}
          {plan.period === 'month' && (
            <div className="month-grid">
              {plan.days.map((d) => (
                <button
                  className={selected === d.date ? '' : 'secondary'}
                  key={d.date}
                  onClick={() => setSelected(d.date)}
                >
                  {d.date.slice(5)}
                </button>
              ))}
            </div>
          )}
          {(plan.period === 'month' ? plan.days.filter((d) => d.date === selected) : plan.days).map(
            (day) => (
              <div className="plan-day" key={day.date}>
                <h3>{day.date}</h3>
                <div className="grid">
                  {meals.map((meal) => {
                    const recipe = data.recipes.find((r) => r.id === day[`${meal}RecipeId`]);
                    return (
                      <article className="meal-card" key={meal}>
                        <strong>{mealLabels[meal]}</strong>
                        {recipe ? (
                          <>
                            <h4>
                              <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                            </h4>
                            <Link to={`/cook/${recipe.id}`}>开始烹饪</Link>
                          </>
                        ) : (
                          <p>关联菜谱已移除</p>
                        )}
                        <button className="secondary" onClick={() => replace(day.date, meal)}>
                          替换{mealLabels[meal]}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </section>
      ) : (
        <Empty>选择周期与条件，生成你的第一份饮食计划。</Empty>
      )}
      <section className="card">
        <h2>已保存计划</h2>
        {data.mealPlans.length ? (
          data.mealPlans.map((p) => (
            <div className="row between saved-plan" key={p.id}>
              <span>
                {p.startDate} — {p.endDate} ·{' '}
                {{ today: '今日', week: '一周', month: '一个月' }[p.period]}
              </span>
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => {
                    setPlan(p);
                    setSelected(p.startDate);
                    setPeriod(p.period);
                    setStart(p.startDate);
                    setConditions(p.conditions);
                  }}
                >
                  查看计划
                </button>
                <button
                  className="danger"
                  onClick={async () => {
                    if (
                      confirm('确认删除这份计划？') &&
                      (await run(() => repositories.mealPlans.delete(p.id), '计划已删除'))
                    )
                      if (plan?.id === p.id) setPlan(null);
                  }}
                >
                  删除计划
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>暂无保存计划，生成后点击保存。</p>
        )}
      </section>
    </>
  );
}

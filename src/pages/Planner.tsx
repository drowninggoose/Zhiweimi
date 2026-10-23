import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { generatePlan, pickMealRecipe, buildShoppingList } from '../services/planningService';
import { Image } from '../components/common';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { planningFlavors } from '../services/preferenceMemoryService';

const DRAFT_KEY = 'zhiweimi:plan-draft';
const PICK_KEY = 'zhiweimi:plan-pick';

function latestSavedPlan(plans: MealPlan[] | undefined): MealPlan | null {
  if (!plans?.length) return null;
  return [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

type PlanPick = { date: string; meal: (typeof meals)[number]; recipeId: string };

function readDraft(): MealPlan | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as MealPlan) : null;
  } catch {
    return null;
  }
}
function writeDraft(plan: MealPlan) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(plan));
  } catch {
    /* 忽略配额错误 */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
}
function readPick(): PlanPick | null {
  try {
    const raw = sessionStorage.getItem(PICK_KEY);
    return raw ? (JSON.parse(raw) as PlanPick) : null;
  } catch {
    return null;
  }
}
function clearPick() {
  try {
    sessionStorage.removeItem(PICK_KEY);
  } catch {
    /* 忽略 */
  }
}
import { Empty } from '../components/common';
import { today, meals, mealLabels, type MealPlan, type PlanConditions } from '../types/models';
export function PlannerPage() {
  const { data, run } = useData();
  const navigate = useNavigate();
  /** 天数输入框：用字符串存，允许中间态为空，生成时再解析 */
  const [dayInput, setDayInput] = useState('1');
  const [start, setStart] = useState(today());
  const [conditions, setConditions] = useState<PlanConditions>(() => ({
    flavors: data?.preferences.flavorPreferences ?? [],
    avoidIngredients: data?.preferences.avoidIngredients ?? [],
    difficulty: data?.preferences.defaultDifficulty,
    preferPantry: true,
  }));
  /**
   * 计划草稿：从 sessionStorage 恢复，保证「去全部菜品里挑菜」再回来时不丢。
   * 如果带回了选中的菜，这里直接把替换结果算出来（只算一次，不在渲染期 setState）。
   */
  const [plan, setPlan] = useState<MealPlan | null>(() => {
    const draft = readDraft();
    const pick = readPick();
    if (draft && pick) {
      clearDraft();
      clearPick();
      try {
        return pickMealRecipe(draft, pick.date, pick.meal, pick.recipeId);
      } catch {
        return draft;
      }
    }
    return draft ?? latestSavedPlan(data?.mealPlans);
  });
  const [selected, setSelected] = useState(() => plan?.startDate ?? today());
  const [error, setError] = useState('');
  /** 由计划反推的采购清单：已有库存会被剔除。 */
  const shoppingList = useMemo(
    () => (plan && data ? buildShoppingList(plan, data.recipes, data.pantryItems) : []),
    [plan, data],
  );

  // 打开页面时把最近保存的计划同步回表单，避免「重新生成」按默认 1 天覆盖。
  useEffect(() => {
    if (!plan) return;
    const days =
      plan.dayCount ??
      (plan.period === 'week' ? 7 : plan.period === 'month' ? plan.days.length : 1);
    setDayInput(String(days));
    setStart(plan.startDate);
  }, [plan]);

  useEffect(() => {
    let active = true;
    void repositories.preferenceMemory
      .active()
      .then((list) => {
        if (!active) return;
        const fromMemory = planningFlavors(list);
        const preferences = data?.preferences;
        setConditions((current) => ({
          ...current,
          flavors: [...new Set([...(preferences?.flavorPreferences ?? []), ...fromMemory])],
          avoidIngredients: preferences?.avoidIngredients ?? current.avoidIngredients,
        }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [data?.preferences]);

  if (!data) return null;
  function generate() {
    try {
      const dayCount = Math.max(1, Math.min(30, Math.round(Number(dayInput)) || 1));
      const next = generatePlan(
        data!.recipes,
        data!.pantryItems,
        {
          ...conditions,
          flavors: conditions.flavors.map((s) => s.trim()).filter(Boolean),
          avoidIngredients: conditions.avoidIngredients.map((s) => s.trim()).filter(Boolean),
        },
        dayCount === 7 ? 'week' : dayCount === 1 ? 'today' : 'month',
        start,
        plan ?? undefined,
        dayCount,
      );
      setPlan(next);
      writeDraft(next);
      setSelected(next.startDate);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <div className="row between page-intro-row">
        <SectionTitle icon="calendar">把三餐安排得从容一点</SectionTitle>
      </div>
      <section className="card fields">
        <div className="row">
          <label>
            计划天数（1-30）
            <input
              type="number"
              min={1}
              max={30}
              value={dayInput}
              onChange={(e) => setDayInput(e.target.value)}
            />
          </label>
          <label>
            开始日期
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
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
        </div>
        <div className="plan-preference">
          <div className="plan-preference-head">
            <span className="plan-preference-mark" aria-hidden="true">
              <Icon name="bowl" size={30} />
            </span>
            <span className="plan-preference-title">
              <strong>你的口味偏好</strong>
            </span>
            <Link className="button secondary plan-preference-link" to="/settings">
              调整偏好
            </Link>
          </div>
          <div className="plan-preference-body">
            <div>
              <small>喜欢的味道</small>
              <div className="plan-chips">
                {conditions.flavors.filter(Boolean).length ? (
                  conditions.flavors
                    .filter(Boolean)
                    .map((flavor) => <span key={flavor}>{flavor}</span>)
                ) : (
                  <em>暂无</em>
                )}
              </div>
            </div>
            <div>
              <small>需要避开</small>
              <div className="plan-chips">
                {conditions.avoidIngredients.filter(Boolean).length ? (
                  conditions.avoidIngredients
                    .filter(Boolean)
                    .map((item) => <span key={item}>{item}</span>)
                ) : (
                  <em>暂无</em>
                )}
              </div>
            </div>
          </div>
        </div>
        <button className="right-action" onClick={generate}>
          生成演示计划
        </button>
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
                            <Link className="meal-card-media" to={`/recipes/${recipe.id}`}>
                              <Image
                                image={recipe.coverImage}
                                url={recipe.coverUrl}
                                alt={recipe.name}
                              />
                            </Link>
                            <h4>
                              <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                            </h4>
                            <Link to={`/cook/${recipe.id}`}>开始烹饪</Link>
                          </>
                        ) : (
                          <p>关联菜谱已移除</p>
                        )}
                        <button
                          className="secondary"
                          onClick={() => {
                            // 先把当前计划存成草稿，去「全部菜品」挑完再回来时不会丢
                            writeDraft(plan);
                            sessionStorage.setItem(
                              PICK_KEY,
                              JSON.stringify({ date: day.date, meal }),
                            );
                            navigate('/recipes?pick=1');
                          }}
                        >
                          替换{mealLabels[meal]}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ),
          )}
          <section className="plan-shopping" aria-labelledby="shopping-title">
            <div className="row between">
              <div>
                <span className="tag">计划 → 采购</span>
                <h3 id="shopping-title">缺货采购清单</h3>
              </div>
              <Link className="button secondary" to="/planner/pantry?new=1">
                采购后录入库存
              </Link>
            </div>
            {shoppingList.length ? (
              <>
                <p className="muted">
                  共 {shoppingList.length} 项，已剔除家庭食材里现有的；同名食材已合并并标明用途。
                </p>
                <div className="shopping-grid">
                  {shoppingList.slice(0, 24).map((item) => (
                    <article key={item.name}>
                      <strong>{item.name}</strong>
                      <small>{item.amounts.join(' / ') || '按需'}</small>
                      <small>用于：{item.from.slice(0, 2).join('、')}{item.from.length > 2 ? ' 等' : ''}</small>
                    </article>
                  ))}
                </div>
                {shoppingList.length > 24 && (
                  <p className="muted">另有 {shoppingList.length - 24} 项，请按实际用量采购。</p>
                )}
              </>
            ) : (
              <p className="success">现有库存已覆盖这份计划的食材。</p>
            )}
          </section>
        </section>
      ) : (
        <Empty>选择周期与条件，生成你的第一份饮食计划。</Empty>
      )}
    </>
  );
}

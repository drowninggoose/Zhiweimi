import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { filterRecipes } from '../services/recipeService';
import { convertIngredient, remedies } from '../services/cookingService';
import { formatSavedAgo, useCookingProgress, type CookingDraft } from '../hooks/useCookingProgress';
import {
  meals,
  mealLabels,
  stamp,
  today,
  type CookingProgress,
  type MealType,
  type Recipe,
  type StoredImage,
} from '../types/models';

/** 「继续烹饪」入口：列出做到一半的菜，点一下回到原来的位置。 */
export function ContinueCooking() {
  const { data } = useData();
  const [items, setItems] = useState<Awaited<ReturnType<typeof repositories.cookingProgress.list>>>(
    [],
  );
  // 进度是异步写入的，这里读一次并订阅后续变更，避免刚离开烹饪时读到空
  useEffect(() => {
    let active = true;
    const load = () =>
      repositories.cookingProgress
        .list()
        .then((list) => {
          if (active) setItems(list);
        })
        .catch(() => undefined);
    void load();
    // 启动后短暂补读一次，覆盖「刚写完就切页面」的时序
    const timer = window.setTimeout(() => void load(), 800);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [data?.recipes, data?.diaryEntries]);
  if (!data) return null;
  // 「已完成」指正在写日记的草稿，不列入待继续的清单
  const unfinished = items.filter((item) => !item.completed);
  if (!unfinished.length) return null;
  async function removeProgress(recipeId: string, recipeName: string) {
    if (!window.confirm(`确定删除「${recipeName}」的烹饪进度吗？删除后不能再接着做。`)) return;
    try {
      await repositories.cookingProgress.remove(recipeId);
      setItems((prev) => prev.filter((item) => item.recipeId !== recipeId));
    } catch {
      // 删除失败保持原样，用户可再试
    }
  }
  return (
    <section className="card continue-cooking">
      <div className="row between">
        <h2>继续上次的烹饪</h2>
        <span className="tag">进度已自动保存</span>
      </div>
      <p className="muted">做到一半也可以先去忙别的，回来接着做。</p>
      {unfinished.map((item) => {
        const recipe = data.recipes.find((r) => r.id === item.recipeId);
        if (!recipe) return null;
        const total = recipe.steps.length;
        return (
          <div className="row between continue-row" key={item.recipeId}>
            <span>
              <strong>{item.recipeName}</strong>
              <small>
                {`第 ${Math.min(item.stepIndex + 1, total)} / ${total} 步`}
                {' · '}
                {formatSavedAgo(item.savedAt)}
              </small>
            </span>
            <span className="row">
              <Link className="button" to={`/cook/${item.recipeId}/steps`}>
                继续烹饪
              </Link>
              <button
                type="button"
                className="secondary"
                aria-label={`删除${item.recipeName}的进度`}
                onClick={() => void removeProgress(item.recipeId, item.recipeName)}
              >
                删除进度
              </button>
            </span>
          </div>
        );
      })}
    </section>
  );
}

export function CookingSelect() {
  const { data } = useData();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  if (!data) return null;
  let recipes = filterRecipes(data.recipes, { query, favorites: tab === 'favorites' }).filter(
    (r) => r.status === 'published',
  );
  if (tab === 'recent')
    recipes = recipes.filter((r) => data.demoState.recentRecipeIds.includes(r.id));
  return (
    <>
      <h2>今天从哪道菜开始？</h2>
      <ContinueCooking />
      <div className="card row">
        <input
          aria-label="烹饪菜谱搜索"
          value={query}
          placeholder="搜索菜名或食材"
          onChange={(e) => setQuery(e.target.value)}
        />
        {[
          ['all', '全部菜谱'],
          ['recent', '最近查看'],
          ['favorites', '已收藏'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? '' : 'secondary'}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {recipes.length ? (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      ) : (
        <Empty>没有可烹饪的菜谱，试试全部菜谱。</Empty>
      )}
    </>
  );
}
export function CookingPrepare() {
  const { recipeId } = useParams();
  const { data, run } = useData();
  const navigate = useNavigate();
  const recipe = data?.recipes.find((r) => r.id === recipeId && r.status === 'published');

  if (!recipe || !data)
    return (
      <Empty>
        菜谱不可用。<Link to="/cook">重新选择</Link>
      </Empty>
    );

  const target = recipe;
  /** 进入分步烹饪：先把当前状态存成进度。 */
  async function startSteps() {
    const now = new Date().toISOString();
    await run(
      () =>
        repositories.cookingProgress.save({
          id: `progress-${recipe!.id}`,
          createdAt: now,
          updatedAt: now,
          savedAt: now,
          recipeId: target.id,
          recipeName: target.name,
          stage: 'steps',
          stepIndex: 0,
          completed: false,
          // 不再由用户单选厨具，换算直接使用已上传的全部厨具
          utensilChoices: {},
          rating: '满意',
          notes: '',
          date: today(),
          mealType: 'dinner',
        }),
      '',
    );
    navigate(`/cook/${target.id}/steps`);
  }
  return (
    <>
      <section className="card">
        <h2>准备制作 {recipe.name}</h2>
        <span className="tag">模拟换算</span>
        <p className="muted">用量会按你已上传的厨具自动换算；仅支持毫升换算，其余保留原始用量。</p>
        {recipe.ingredients.map((i) => (
          <div className="ingredient-row" key={i.id}>
            <strong>{i.name}</strong>
            <span>{convertIngredient(i, data.utensils).text || '适量'}</span>
          </div>
        ))}
        {!data.utensils.length && (
          <p role="status" className="notice">
            ⚠️ 你还没有添加任何厨具，当前显示的是菜谱原始用量。
            <Link to="/utensils?new=1">去添加厨具</Link>
            之后就能按自家餐具看到具体用量。
          </p>
        )}
        <button onClick={() => void startSteps()}>准备完成，开始分步烹饪</button>
        <p className="muted">开始后进度会自动保存，随时可以离开再回来。</p>
      </section>
    </>
  );
}
export function CookingSteps() {
  const { recipeId } = useParams();
  const { data } = useData();
  const recipe = data?.recipes.find((r) => r.id === recipeId && r.status === 'published');
  const progress = useCookingProgress(recipeId);

  if (!recipe)
    return (
      <Empty>
        菜谱步骤不可用。<Link to="/cook">重新选择</Link>
      </Empty>
    );
  if (progress.loading)
    return (
      <section className="card">
        <p className="muted">正在恢复上次的进度…</p>
      </section>
    );
  // key 只跟菜谱绑定：读取完成前不会渲染内层，所以初值一定拿得到；
  // 结束后也不换 key，避免重挂载把已删除的进度又写回来。
  const effectiveRecipe = progress.initial?.adaptedSteps?.length
    ? { ...recipe, steps: progress.initial.adaptedSteps }
    : recipe;
  return (
    <CookingStepsView
      key={effectiveRecipe.id}
      recipe={effectiveRecipe}
      saved={progress.initial}
      savedAt={progress.savedAt}
      onSave={progress.save}
      onDiscard={progress.discard}
    />
  );
}

/** 分步烹饪主体：状态初值来自上次保存的进度，之后每次改动自动保存。 */
function CookingStepsView({
  recipe,
  saved,
  savedAt,
  onSave,
  onDiscard,
}: {
  recipe: Recipe;
  saved: CookingProgress | null;
  savedAt?: string;
  onSave: (draft: CookingDraft) => void;
  onDiscard: () => Promise<void>;
}) {
  const { data, run } = useData();
  const navigate = useNavigate();
  const maxIndex = Math.max(recipe.steps.length - 1, 0);
  const [index, setIndex] = useState(() => Math.min(Math.max(saved?.stepIndex ?? 0, 0), maxIndex));
  const [complete, setComplete] = useState(() => Boolean(saved?.completed));
  const [problem, setProblem] = useState<keyof typeof remedies | undefined>(
    saved?.problem as keyof typeof remedies | undefined,
  );
  const [image, setImage] = useState<StoredImage | undefined>(saved?.image);
  const [rating, setRating] = useState(saved?.rating || '满意');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [date, setDate] = useState(saved?.date || today());
  const [meal, setMeal] = useState<MealType>(saved?.mealType || 'dinner');
  /** 已经结束（保存日记 / 仅完成），不再自动保存。 */
  const [finished, setFinished] = useState(false);
  const utensilChoices = useMemo(() => saved?.utensilChoices ?? {}, [saved]);
  const cookingUtensilId = saved?.cookingUtensilId;
  const adaptedSteps = saved?.adaptedSteps;
  const adaptationSummary = saved?.adaptationSummary;
  const step = recipe.steps[index];

  // 每次改动都自动保存（Hook 内部防抖 600ms）；结束后停止写入
  useEffect(() => {
    if (finished) return;
    onSave({
      stage: complete ? 'complete' : 'steps',
      stepIndex: index,
      completed: complete,
      utensilChoices,
      cookingUtensilId,
      adaptedSteps,
      adaptationSummary,
      problem,
      rating,
      notes,
      date,
      mealType: meal,
      image,
    });
  }, [
    finished,
    onSave,
    complete,
    index,
    utensilChoices,
    cookingUtensilId,
    adaptedSteps,
    adaptationSummary,
    problem,
    rating,
    notes,
    date,
    meal,
    image,
  ]);

  async function saveDiary() {
    const entry = {
      ...stamp(),
      date,
      mealType: meal,
      dishName: recipe.name,
      recipeId: recipe.id,
      image,
      tasteRating: rating,
      notes,
      adjustmentNotes: problem ? `${problem}：${remedies[problem]}` : undefined,
    };
    const existing = data?.diaryEntries.find((e) => e.date === date && e.mealType === meal);
    if (existing && !confirm('同一天同一餐已有日记，是否替换？')) return;
    if (
      await run(() => repositories.diaryEntries.save(entry, !!existing), '烹饪成果已保存到日记')
    ) {
      setFinished(true);
      await onDiscard();
      navigate('/diary');
    }
  }
  return complete ? (
    <section className="card fields">
      <h2>完成啦，记录这一餐</h2>
      {savedAt ? (
        <p className="save-hint">↺ 已恢复上次的进度（{formatSavedAgo(savedAt)}保存）</p>
      ) : null}
      <ImageUpload label="成品照片" value={image} onChange={setImage} />
      <div className="row">
        <label>
          日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          餐次
          <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
            {meals.map((m) => (
              <option key={m} value={m}>
                {mealLabels[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          味道评价
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option>满意</option>
            <option>还不错</option>
            <option>下次再调整</option>
          </select>
        </label>
      </div>
      <label>
        心得
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => void saveDiary()}>保存到日记</button>
        <button
          className="secondary"
          onClick={() => {
            void (async () => {
              setFinished(true);
              await onDiscard();
              navigate('/cook');
            })();
          }}
        >
          仅完成
        </button>
      </div>
      <p className="muted">填写内容也会自动保存，中途离开不会丢。</p>
    </section>
  ) : (
    <>
      <section className="card cooking-step">
        <span className="tag">
          步骤 {index + 1} / {recipe.steps.length}
        </span>
        <h2>{recipe.name}</h2>
        <p className="step-instruction">{step.instruction}</p>
        {step.image && (
          <Image image={step.image} alt={`步骤${index + 1}`} className="upload-preview" />
        )}
        <div className="row between">
          <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            上一步
          </button>
          {index < recipe.steps.length - 1 ? (
            <button onClick={() => setIndex(index + 1)}>下一步</button>
          ) : (
            <button onClick={() => setComplete(true)}>完成烹饪</button>
          )}
        </div>
        <p className="muted save-hint">
          {savedAt ? '↺ 已恢复上次进度 · ' : ''}进度会自动保存，可以先去浏览别的功能，回来接着做。
        </p>
      </section>
      <section className="card">
        <h2>味道或状态需要调整？</h2>
        <span className="tag">模拟建议，不替代实际判断</span>
        <div className="row">
          {Object.keys(remedies).map((p) => (
            <button
              key={p}
              className="secondary"
              onClick={() => setProblem(p as keyof typeof remedies)}
            >
              {p}
            </button>
          ))}
        </div>
        {problem && <p>{remedies[problem]}</p>}
      </section>
    </>
  );
}

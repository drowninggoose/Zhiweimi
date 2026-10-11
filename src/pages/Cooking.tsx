import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { useTimer } from '../hooks/useTimer';
import { filterRecipes } from '../services/recipeService';
import { convertIngredient, remedies } from '../services/cookingService';
import { meals, mealLabels, stamp, today, type MealType, type StoredImage } from '../types/models';
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
  const { data } = useData();
  const recipe = data?.recipes.find((r) => r.id === recipeId && r.status === 'published');
  const [selected, setSelected] = useState<Record<string, string>>({});
  if (!recipe || !data)
    return (
      <Empty>
        菜谱不可用。<Link to="/cook">重新选择</Link>
      </Empty>
    );
  return (
    <>
      <section className="card">
        <h2>准备制作 {recipe.name}</h2>
        <span className="tag">模拟换算</span>
        <p className="muted">默认使用全部厨具匹配；仅支持毫升换算，其余保留原始用量。</p>
        {recipe.ingredients.map((i) => (
          <div className="ingredient-row" key={i.id}>
            <strong>{i.name}</strong>
            <span>{convertIngredient(i, data.utensils, selected[i.id]).text || '适量'}</span>
            <select
              aria-label={`${i.name}换算厨具`}
              value={selected[i.id] ?? ''}
              onChange={(e) => setSelected({ ...selected, [i.id]: e.target.value })}
            >
              <option value="">自动匹配全部厨具</option>
              {data.utensils.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.capacity} ml
                </option>
              ))}
            </select>
          </div>
        ))}
        {!data.utensils.length && (
          <p>
            还没有厨具，将展示原始单位。<Link to="/utensils?new=1">添加厨具</Link>
          </p>
        )}
        <Link className="button" to={`/cook/${recipe.id}/steps`}>
          准备完成，开始分步烹饪
        </Link>
      </section>
    </>
  );
}
export function CookingSteps() {
  const { recipeId } = useParams();
  const { data, run } = useData();
  const navigate = useNavigate();
  const recipe = data?.recipes.find((r) => r.id === recipeId && r.status === 'published');
  const [index, setIndex] = useState(0);
  const { seconds, running, setSeconds, setRunning } = useTimer(
    recipe?.steps[0]?.timerSeconds ?? 0,
  );
  const [complete, setComplete] = useState(false);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState<keyof typeof remedies>();
  const [image, setImage] = useState<StoredImage>();
  const [rating, setRating] = useState('满意');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(today());
  const [meal, setMeal] = useState<MealType>('dinner');
  const permitLeave = useUnsaved(!finished, '离开烹饪页后进度不会保存，确认离开？');
  const step = recipe?.steps[index];
  if (!recipe || !step)
    return (
      <Empty>
        菜谱步骤不可用。<Link to="/cook">重新选择</Link>
      </Empty>
    );
  function move(next: number) {
    setIndex(next);
    setRunning(false);
    setSeconds(recipe!.steps[next].timerSeconds ?? 0);
  }
  async function saveDiary() {
    const entry = {
      ...stamp(),
      date,
      mealType: meal,
      dishName: recipe!.name,
      recipeId: recipe!.id,
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
      permitLeave();
      setFinished(true);
      navigate('/diary');
    }
  }
  return complete ? (
    <section className="card fields">
      <h2>完成啦，记录这一餐</h2>
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
            permitLeave();
            setFinished(true);
            navigate('/cook');
          }}
        >
          仅完成
        </button>
      </div>
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
        <div className="timer" role="timer">
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </div>
        <label>
          计时秒数
          <input
            aria-label="计时秒数"
            type="number"
            min="0"
            value={seconds}
            disabled={running && seconds > 0}
            onChange={(e) => setSeconds(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <div className="row">
          <button disabled={seconds <= 0} onClick={() => setRunning(!running)}>
            {running && seconds > 0 ? '暂停计时' : '启动计时'}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setRunning(false);
              setSeconds(step.timerSeconds ?? 0);
            }}
          >
            重置计时
          </button>
          {running && seconds === 0 && <span role="status">计时结束</span>}
        </div>
        <div className="row between">
          <button className="secondary" disabled={index === 0} onClick={() => move(index - 1)}>
            上一步
          </button>
          {index < recipe.steps.length - 1 ? (
            <button onClick={() => move(index + 1)}>下一步</button>
          ) : (
            <button
              onClick={() => {
                setRunning(false);
                setComplete(true);
              }}
            >
              完成烹饪
            </button>
          )}
        </div>
        <p className="muted">离开后进度不会保存，再次进入需重新开始。</p>
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

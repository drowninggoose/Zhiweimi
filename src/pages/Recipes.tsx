import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { validateRecipe } from '../services/recipeService';
import { id, stamp, meals, mealLabels, type MealType, type Recipe } from '../types/models';
// 品类（下钻第 1 层）
const DISH_TYPES: { value: string; label: string; match: string[] }[] = [
  { value: '热菜', label: '热菜', match: ['热菜'] },
  { value: '凉菜', label: '凉菜', match: ['凉菜'] },
  { value: '汤羹', label: '汤羹', match: ['汤羹'] },
  { value: '主食面食', label: '主食面食', match: ['主食', '面食'] },
  { value: '小吃', label: '小吃', match: ['小吃'] },
  { value: '甜品烘焙', label: '甜品烘焙', match: ['甜品', '甜点', '烘焙'] },
  { value: '西餐', label: '西餐', match: ['西餐'] },
];
// 菜系（下钻第 2 层）
const CUISINE_FAMILIES = [
  '家常菜',
  '川菜',
  '粤菜',
  '鲁菜',
  '苏菜',
  '浙菜',
  '闽菜',
  '湘菜',
  '徽菜',
  '本帮菜',
];
/** 按时间：具体烹饪时间段，替代原来的「用时最短」排序。 */
const TIME_RANGES: { value: string; label: string; max: number; min?: number }[] = [
  { value: '0-10', label: '1-10 分钟', max: 10 },
  { value: '10-30', label: '10-30 分钟', min: 10, max: 30 },
  { value: '30-60', label: '30-60 分钟', min: 30, max: 60 },
  { value: '60-120', label: '1-2 小时', min: 60, max: 120 },
  { value: '120+', label: '2 小时以上', min: 120, max: Infinity },
];
/** 一行一个维度的平铺标签。 */
function TileRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tile-row">
      <span className="index-label">{label}</span>
      <div className="tile-scroll">
        {options.map((o) => (
          <button
            key={o.value || 'all'}
            type="button"
            className={value === o.value ? 'active' : ''}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function RecipesPage() {
  const { data } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [source, setSource] = useState('');
  // 三个并列维度：按餐次 / 按时间 / 按品类
  const [meal, setMeal] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [dishType, setDishType] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [flavor, setFlavor] = useState('');
  if (!data) return null;

  /** 品类维度：先按大类，再按菜系、口味收窄。 */
  const byDish = dishType
    ? data.recipes.filter((r) =>
        (DISH_TYPES.find((d) => d.value === dishType)?.match ?? []).some((m) =>
          r.cuisines.includes(m),
        ),
      )
    : data.recipes;
  const cuisineOptions = [
    { value: '', label: '全部' },
    ...[...new Set(byDish.flatMap((r) => r.cuisines))]
      .filter((c) => CUISINE_FAMILIES.includes(c))
      .sort()
      .map((c) => ({ value: c, label: c })),
  ];
  const byCuisine = cuisine ? byDish.filter((r) => r.cuisines.includes(cuisine)) : byDish;
  const flavorOptions = [
    { value: '', label: '全部' },
    ...[...new Set(byCuisine.flatMap((r) => r.flavorTags))]
      .sort()
      .map((f) => ({ value: f, label: f })),
  ];
  const byFlavor = flavor ? byCuisine.filter((r) => r.flavorTags.includes(flavor)) : byCuisine;

  /** 三个维度同时生效（AND）。 */
  let results = byFlavor;
  if (meal) results = results.filter((r) => r.mealTypes.includes(meal as MealType));
  if (timeRange) {
    const range = TIME_RANGES.find((t) => t.value === timeRange);
    if (range) {
      results = results.filter((r) => {
        const minutes = r.estimatedMinutes;
        if (minutes === undefined) return false;
        if (minutes < (range.min ?? 0)) return false;
        return minutes <= range.max;
      });
    }
  }
  if (source === 'mine') results = results.filter((r) => r.sourceType === 'user');
  else if (source === 'favorites') results = results.filter((r) => r.favorite);
  const kw = query.trim();
  if (kw)
    results = results.filter((r) =>
      `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.includes(kw),
    );

  // 搜索联想
  const dishHits = kw ? data.recipes.filter((r) => r.name.includes(kw)).slice(0, 6) : [];
  const ingredientHits = kw
    ? [...new Set(data.recipes.flatMap((r) => r.ingredientTags))]
        .filter((i) => i.includes(kw))
        .slice(0, 6)
    : [];
  const showSuggest = kw !== '' && (dishHits.length > 0 || ingredientHits.length > 0);

  /** 清除筛选：三个维度、来源、搜索框全部回到「全部」。 */
  function resetAll() {
    setMeal('');
    setTimeRange('');
    setDishType('');
    setCuisine('');
    setFlavor('');
    setSource('');
    setQuery('');
  }
  return (
    <>
      <div className="row between">
        <h2>找到想做的那道菜</h2>
        <Link className="button" to="/recipes/new">
          新建菜谱
        </Link>
      </div>
      <div className="search-box" style={{ marginBottom: 16 }}>
        <input
          aria-label="菜谱搜索"
          placeholder="菜名或食材"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showSuggest && (
          <div className="suggest-list">
            {dishHits.map((r) => (
              <button
                key={`d-${r.id}`}
                onClick={() => {
                  setQuery('');
                  navigate(`/recipes/${r.id}`);
                }}
              >
                {r.name}
                <span className="suggest-kind">菜品</span>
              </button>
            ))}
            {ingredientHits.map((i) => (
              <button key={`i-${i}`} onClick={() => setQuery(i)}>
                {i}
                <span className="suggest-kind">食材</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 三个并列维度：一行一个维度，选项平铺，第一个永远是「全部」 */}
      <div className="tile-rows">
        <TileRow
          label="按餐次"
          options={[
            { value: '', label: '全部' },
            ...meals.map((m) => ({ value: m, label: mealLabels[m] })),
          ]}
          value={meal}
          onChange={setMeal}
        />
        <TileRow
          label="按时间"
          options={[{ value: '', label: '全部' }, ...TIME_RANGES.map((t) => ({ value: t.value, label: t.label }))]}
          value={timeRange}
          onChange={setTimeRange}
        />
        <TileRow
          label="按品类"
          options={[
            { value: '', label: '全部' },
            ...DISH_TYPES.map((d) => ({ value: d.value, label: d.label })),
          ]}
          value={dishType}
          onChange={(v) => {
            setDishType(v);
            setCuisine('');
            setFlavor('');
          }}
        />
        {dishType ? (
          <TileRow
            label="菜系"
            options={cuisineOptions}
            value={cuisine}
            onChange={(v) => {
              setCuisine(v);
              setFlavor('');
            }}
          />
        ) : null}
        {cuisine ? (
          <TileRow label="口味" options={flavorOptions} value={flavor} onChange={setFlavor} />
        ) : null}
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="muted">{results.length} 道菜</span>
        <div className="row">
          <button
            type="button"
            className={source === 'mine' ? '' : 'secondary'}
            onClick={() => setSource(source === 'mine' ? '' : 'mine')}
          >
            我的菜谱
          </button>
          <button
            type="button"
            className={source === 'favorites' ? '' : 'secondary'}
            onClick={() => setSource(source === 'favorites' ? '' : 'favorites')}
          >
            我的收藏
          </button>
          <button type="button" className="secondary" onClick={resetAll}>
            清除筛选
          </button>
        </div>
      </div>
      {results.length ? (
        <div className="grid">
          {results.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      ) : (
        <Empty>没有符合条件的菜谱，清除筛选或新建菜谱试试。</Empty>
      )}
    </>
  );
}
export function RecipeDetail() {
  const { id: recipeId } = useParams();
  const { data, run } = useData();
  const navigate = useNavigate();
  const recipe = data?.recipes.find((r) => r.id === recipeId);
  useEffect(() => {
    if (recipeId) void run(() => repositories.recipes.viewed(recipeId), '');
  }, [recipeId, run]);
  if (!recipe)
    return (
      <Empty>
        菜谱不存在。<Link to="/recipes">返回菜谱总览</Link>
      </Empty>
    );
  return (
    <>
      <section className="card detail">
        <Image image={recipe.coverImage} url={recipe.coverUrl} alt={recipe.name} />
        <div>
          <h2>{recipe.name}</h2>
          <p>
            {recipe.cuisines.join(' · ')} / {recipe.estimatedMinutes} 分钟
          </p>
          <p>
            {recipe.sourceType === 'library'
              ? '菜谱库'
              : recipe.sourceType === 'demo'
                ? '演示菜谱'
                : '我的菜谱'}{' '}
            · {recipe.status === 'draft' ? '草稿' : '已发布'}
          </p>
          <div className="row">
            <button
              onClick={() => void run(() => repositories.recipes.favorite(recipe), '收藏已更新')}
            >
              {recipe.favorite ? '取消收藏' : '收藏'}
            </button>
            {recipe.status === 'published' && (
              <Link className="button" to={`/cook/${recipe.id}`}>
                开始烹饪
              </Link>
            )}
            <Link className="button secondary" to={`/recipes/${recipe.id}/edit`}>
              {recipe.sourceType === 'user' ? '编辑菜谱' : '创建副本'}
            </Link>
            {recipe.sourceType === 'user' && (
              <button
                className="danger"
                onClick={async () => {
                  if (
                    confirm('删除菜谱？关联日记会保留，计划中的引用将移除。') &&
                    (await run(() => repositories.recipes.delete(recipe.id), '菜谱已删除'))
                  )
                    navigate('/recipes');
                }}
              >
                删除菜谱
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="card">
        <h2>食材清单</h2>
        {recipe.ingredients.map((i) => (
          <p key={i.id}>
            {i.name} {i.amount} {i.unit} {i.note}
          </p>
        ))}
      </section>
      <section className="card">
        <h2>烹饪步骤</h2>
        {recipe.steps.map((s, i) => (
          <article key={s.id}>
            <h3>
              {i + 1}. {s.instruction}
            </h3>
            {s.image && <Image image={s.image} alt={`步骤${i + 1}`} className="upload-preview" />}
          </article>
        ))}
        <p>{recipe.notes}</p>
      </section>
    </>
  );
}
function blankRecipe(): Recipe {
  return {
    ...stamp(),
    name: '',
    cuisines: ['家常菜'],
    ingredientTags: [],
    mealTypes: ['lunch', 'dinner'],
    flavorTags: ['清淡'],
    difficulty: 'easy',
    estimatedMinutes: 15,
    ingredients: [{ id: id(), name: '', unit: 'g' }],
    steps: [{ id: id(), order: 1, instruction: '' }],
    sourceType: 'user',
    status: 'draft',
    favorite: false,
  };
}
export function RecipeEditor() {
  const { id: recipeId } = useParams();
  const { data, run } = useData();
  const navigate = useNavigate();
  const source = data?.recipes.find((r) => r.id === recipeId);
  const [recipe, setRecipe] = useState<Recipe>(() =>
    source
      ? {
          ...source,
          ...(source.sourceType === 'user' ? {} : stamp()),
          sourceType: 'user',
          name: source.sourceType === 'user' ? source.name : `${source.name}（我的版本）`,
        }
      : blankRecipe(),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const permitLeave = useUnsaved(dirty);
  const update = (next: Partial<Recipe>) => {
    setRecipe({ ...recipe, ...next });
    setDirty(true);
  };
  async function save(status: Recipe['status']) {
    const value = {
      ...recipe,
      status,
      cuisines: recipe.cuisines.map((s) => s.trim()).filter(Boolean),
      flavorTags: recipe.flavorTags.map((s) => s.trim()).filter(Boolean),
      ingredientTags: recipe.ingredients.map((i) => i.name).filter(Boolean),
      steps: recipe.steps.map((s, i) => ({ ...s, order: i + 1 })),
    };
    try {
      validateRecipe(value);
      setError('');
      if (
        await run(() =>
          source?.sourceType === 'user'
            ? repositories.recipes.update(value)
            : repositories.recipes.create(value),
        )
      ) {
        permitLeave();
        setDirty(false);
        navigate(`/recipes/${value.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section className="card fields">
      <h2>
        {source && source.sourceType !== 'user'
          ? '创建用户菜谱副本'
          : recipeId
            ? '编辑菜谱'
            : '新建菜谱'}
      </h2>
      <p className="muted">标签为本地模拟理解，可自由修改。不需要填写用餐人数。</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label>
        菜名
        <input value={recipe.name} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <ImageUpload
        value={recipe.coverImage}
        onChange={(image) => update({ coverImage: image, coverUrl: undefined })}
        label="封面"
      />
      <div className="row">
        <label>
          菜系
          <input
            value={recipe.cuisines.join(',')}
            onChange={(e) => update({ cuisines: e.target.value.split(/[,，]/) })}
          />
        </label>
        <label>
          口味
          <input
            value={recipe.flavorTags.join(',')}
            onChange={(e) => update({ flavorTags: e.target.value.split(/[,，]/) })}
          />
        </label>
        <label>
          难度
          <select
            value={recipe.difficulty}
            onChange={(e) => update({ difficulty: e.target.value as Recipe['difficulty'] })}
          >
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="advanced">进阶</option>
          </select>
        </label>
        <label>
          预计分钟
          <input
            type="number"
            value={recipe.estimatedMinutes ?? ''}
            onChange={(e) =>
              update({ estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
      </div>
      <div className="row">
        {meals.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={recipe.mealTypes.includes(m)}
              onChange={(e) =>
                update({
                  mealTypes: e.target.checked
                    ? [...recipe.mealTypes, m]
                    : recipe.mealTypes.filter((x) => x !== m),
                })
              }
            />
            {mealLabels[m]}
          </label>
        ))}
      </div>
      <h3>食材</h3>
      {recipe.ingredients.map((ingredient, i) => (
        <div className="row" key={ingredient.id}>
          <input
            aria-label={`食材${i + 1}`}
            placeholder="名称"
            value={ingredient.name}
            onChange={(e) =>
              update({
                ingredients: recipe.ingredients.map((x, j) =>
                  j === i ? { ...x, name: e.target.value } : x,
                ),
              })
            }
          />
          <input
            aria-label={`数量${i + 1}`}
            type="number"
            value={ingredient.amount ?? ''}
            onChange={(e) =>
              update({
                ingredients: recipe.ingredients.map((x, j) =>
                  j === i
                    ? { ...x, amount: e.target.value ? Number(e.target.value) : undefined }
                    : x,
                ),
              })
            }
          />
          <input
            aria-label={`单位${i + 1}`}
            value={ingredient.unit ?? ''}
            onChange={(e) =>
              update({
                ingredients: recipe.ingredients.map((x, j) =>
                  j === i ? { ...x, unit: e.target.value } : x,
                ),
              })
            }
          />
          <button
            type="button"
            className="secondary"
            disabled={i === 0}
            onClick={() => {
              const items = [...recipe.ingredients];
              [items[i - 1], items[i]] = [items[i], items[i - 1]];
              update({ ingredients: items });
            }}
          >
            上移食材
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => update({ ingredients: recipe.ingredients.filter((_, j) => j !== i) })}
          >
            删除食材
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => update({ ingredients: [...recipe.ingredients, { id: id(), name: '' }] })}
      >
        添加食材
      </button>
      <h3>步骤</h3>
      {recipe.steps.map((step, i) => (
        <div className="card fields" key={step.id}>
          <label>
            步骤{i + 1}
            <textarea
              value={step.instruction}
              onChange={(e) =>
                update({
                  steps: recipe.steps.map((x, j) =>
                    j === i ? { ...x, instruction: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <ImageUpload
            label={`步骤${i + 1}图片`}
            value={step.image}
            onChange={(image) =>
              update({ steps: recipe.steps.map((x, j) => (j === i ? { ...x, image } : x)) })
            }
          />
          <div className="row">
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              onClick={() => {
                const items = [...recipe.steps];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                update({ steps: items });
              }}
            >
              上移步骤
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => update({ steps: recipe.steps.filter((_, j) => j !== i) })}
            >
              删除步骤
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          update({
            steps: [...recipe.steps, { id: id(), order: recipe.steps.length + 1, instruction: '' }],
          })
        }
      >
        添加步骤
      </button>
      <label>
        备注
        <textarea value={recipe.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} />
      </label>
      <div className="row">
        <button onClick={() => void save('draft')}>保存草稿</button>
        <button onClick={() => void save('published')}>正式保存</button>
      </div>
    </section>
  );
}

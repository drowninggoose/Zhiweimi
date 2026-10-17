import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { validateRecipe } from '../services/recipeService';
import { id, stamp, meals, mealLabels, type MealType, type Recipe } from '../types/models';
const DIFF_RANK: Record<string, number> = { easy: 1, normal: 2, advanced: 3 };
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
const SORT_OPTIONS = [
  { value: 'default', label: '综合排序' },
  { value: 'time', label: '用时最短' },
  { value: 'easy', label: '最快上手' },
];
const TIME_OPTIONS = [
  { value: '', label: '全部用时' },
  { value: '15', label: '15分钟内' },
  { value: '30', label: '30分钟内' },
  { value: '45', label: '45分钟内' },
  { value: '60', label: '1小时内' },
];
const DIFF_OPTIONS = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'normal', label: '普通' },
  { value: 'advanced', label: '进阶' },
];
function IndexRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="index-row">
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
function Dropdown({
  placeholder,
  options,
  value,
  onChange,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className={`dropdown-toggle${value ? ' active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current ? current.label : placeholder} ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          {options.map((o) => (
            <button
              key={o.value || 'all'}
              type="button"
              className={value === o.value ? 'active' : ''}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function RecipesPage() {
  const { data } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState('default');
  const [source, setSource] = useState('');
  // 标准一 · 餐次（独立目录，点了直接出结果）
  const [meal, setMeal] = useState('');
  // 标准二 · 品类下钻链
  const [depth, setDepth] = useState(1);
  const [dishType, setDishType] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [flavor, setFlavor] = useState('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [difficulty, setDifficulty] = useState('');
  if (!data) return null;

  // 下钻链：每层的候选只从"当前剩下的菜"里取，保证点下去必有结果
  const byDish = dishType
    ? data.recipes.filter((r) =>
        (DISH_TYPES.find((d) => d.value === dishType)?.match ?? []).some((m) =>
          r.cuisines.includes(m),
        ),
      )
    : data.recipes;
  const cuisineOptions = [
    { value: '', label: '全部菜系' },
    ...[...new Set(byDish.flatMap((r) => r.cuisines))]
      .filter((c) => CUISINE_FAMILIES.includes(c))
      .sort()
      .map((c) => ({ value: c, label: c })),
  ];
  const byCuisine = cuisine ? byDish.filter((r) => r.cuisines.includes(cuisine)) : byDish;
  const flavorOptions = [
    { value: '', label: '全部口味' },
    ...[...new Set(byCuisine.flatMap((r) => r.flavorTags))]
      .sort()
      .map((f) => ({ value: f, label: f })),
  ];
  const byFlavor = flavor ? byCuisine.filter((r) => r.flavorTags.includes(flavor)) : byCuisine;
  const byTime = maxMinutes
    ? byFlavor.filter((r) => (r.estimatedMinutes ?? Infinity) <= Number(maxMinutes))
    : byFlavor;
  const byDiff = difficulty ? byTime.filter((r) => r.difficulty === difficulty) : byTime;

  // 两个标准互斥：餐次模式 或 品类模式
  let results = meal
    ? data.recipes.filter((r) => r.mealTypes.includes(meal as MealType))
    : byDiff;
  if (source === 'mine') results = results.filter((r) => r.sourceType === 'user');
  else if (source === 'favorites') results = results.filter((r) => r.favorite);
  const kw = query.trim();
  if (kw)
    results = results.filter((r) =>
      `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.includes(kw),
    );
  if (sort === 'time')
    results = [...results].sort(
      (a, b) => (a.estimatedMinutes ?? 9999) - (b.estimatedMinutes ?? 9999),
    );
  else if (sort === 'easy')
    results = [...results].sort(
      (a, b) =>
        (DIFF_RANK[a.difficulty ?? 'normal'] ?? 2) - (DIFF_RANK[b.difficulty ?? 'normal'] ?? 2),
    );

  // 搜索联想
  const dishHits = kw ? data.recipes.filter((r) => r.name.includes(kw)).slice(0, 6) : [];
  const ingredientHits = kw
    ? [...new Set(data.recipes.flatMap((r) => r.ingredientTags))]
        .filter((i) => i.includes(kw))
        .slice(0, 6)
    : [];
  const showSuggest = kw !== '' && (dishHits.length > 0 || ingredientHits.length > 0);

  // 两个标准互斥：选了其中一个，就清空另一个
  function pickMeal(v: string) {
    setMeal(v);
    if (v) {
      setDishType('');
      setCuisine('');
      setFlavor('');
      setMaxMinutes('');
      setDifficulty('');
      setDepth(1);
    }
  }
  function pickDishType(v: string) {
    setMeal('');
    setDishType(v);
    setCuisine('');
    setFlavor('');
    setMaxMinutes('');
    setDifficulty('');
    setDepth(Math.max(depth, 2));
  }
  function pickCuisine(v: string) {
    setMeal('');
    setCuisine(v);
    setFlavor('');
    setMaxMinutes('');
    setDifficulty('');
    setDepth(Math.max(depth, 3));
  }
  function pickFlavor(v: string) {
    setMeal('');
    setFlavor(v);
    setMaxMinutes('');
    setDifficulty('');
    setDepth(Math.max(depth, 4));
  }
  function pickTime(v: string) {
    setMeal('');
    setMaxMinutes(v);
    setDifficulty('');
    setDepth(Math.max(depth, 5));
  }
  function pickDifficulty(v: string) {
    setMeal('');
    setDifficulty(v);
  }
  function resetAll() {
    setMeal('');
    setDishType('');
    setCuisine('');
    setFlavor('');
    setMaxMinutes('');
    setDifficulty('');
    setDepth(1);
    setSource('');
    setSort('default');
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

      {/* 标准一 · 餐次：独立分类，选了直接出结果 */}
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="index-label">按餐次</span>
        <Dropdown
          placeholder="全部餐次"
          options={[
            { value: '', label: '全部餐次' },
            ...meals.map((m) => ({ value: m, label: mealLabels[m] })),
          ]}
          value={meal}
          onChange={pickMeal}
        />
      </div>

      {/* 标准二 · 品类：下拉逐级出现，点一层出下一层 */}
      <div className="row" style={{ marginBottom: 14 }}>
        <span className="index-label">按品类</span>
        <Dropdown
          placeholder="全部品类"
          options={[
            { value: '', label: '全部品类' },
            ...DISH_TYPES.map((d) => ({ value: d.value, label: d.label })),
          ]}
          value={dishType}
          onChange={pickDishType}
        />
        {depth >= 2 && (
          <Dropdown
            placeholder="全部菜系"
            options={cuisineOptions}
            value={cuisine}
            onChange={pickCuisine}
          />
        )}
        {depth >= 3 && (
          <Dropdown
            placeholder="全部口味"
            options={flavorOptions}
            value={flavor}
            onChange={pickFlavor}
          />
        )}
        {depth >= 4 && (
          <Dropdown
            placeholder="全部用时"
            options={TIME_OPTIONS}
            value={maxMinutes}
            onChange={pickTime}
          />
        )}
        {depth >= 5 && (
          <Dropdown
            placeholder="全部难度"
            options={DIFF_OPTIONS}
            value={difficulty}
            onChange={pickDifficulty}
          />
        )}
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="muted">{results.length} 道菜</span>
        <div className="row">
          <IndexRow options={SORT_OPTIONS} value={sort} onChange={setSort} />
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

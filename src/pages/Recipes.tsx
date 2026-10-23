import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { FoodIcon } from '../components/FoodIcon';
import { Icon, type IconName } from '../components/Icon';
import { StepText } from '../components/StepText';
import { SectionTitle } from '../components/SectionTitle';
import { readDiaryPick, writeDiaryPick } from '../components/diaryPick';
import { useUnsaved } from '../hooks/useUnsaved';
import { validateRecipe } from '../services/recipeService';
import { cleanRecipe } from '../services/ingredientCleanup';
import { isSeasoning } from '../services/ingredientGroups';
import { id, stamp, meals, mealLabels, type MealType, type Recipe } from '../types/models';
// 品类
const DISH_TYPES: { value: string; label: string; match: string[] }[] = [
  { value: '热菜', label: '热菜', match: ['热菜'] },
  { value: '凉菜', label: '凉菜', match: ['凉菜'] },
  { value: '汤羹', label: '汤羹', match: ['汤羹'] },
  { value: '主食面食', label: '主食面食', match: ['主食', '面食'] },
  { value: '小吃', label: '小吃', match: ['小吃'] },
  { value: '甜品烘焙', label: '甜品烘焙', match: ['甜品', '甜点', '烘焙'] },
  { value: '西餐', label: '西餐', match: ['西餐'] },
];
// 菜系
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
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: IconName;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tile-row">
      <span className="index-label">
        <Icon name={icon} size={17} />
        {label}
      </span>
      <div className="tile-scroll">
        {options.map((o) => (
          <button
            key={o.value || 'all'}
            type="button"
            className={value === o.value ? 'active' : ''}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            onPointerUp={(event) => {
              // 鼠标或触屏点击后释放焦点，避免绿色键盘焦点环被误认为第二个选中项。
              event.currentTarget.blur();
            }}
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
  const [query] = useState(params.get('q') ?? '');
  /**
   * 从其他页面跳过来挑菜：饮食计划用 pick=1，美食日记用 pick=diary。
   * 每张卡片会多一个「选它」按钮。
   */
  const pickTarget = params.get('pick');
  const pickForDiary = pickTarget === 'diary';
  const pickMode = pickTarget === '1' || pickForDiary;
  useEffect(() => {
    if (!pickMode) return;
    // 从日记/计划页滚到一半跳过来时，先回到顶部，让挑菜提示可见。
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pickMode]);
  const [source, setSource] = useState(params.get('source') ?? '');
  // 四个并列维度：餐次 / 时间 / 品类 / 菜系
  const [meal, setMeal] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [dishType, setDishType] = useState('');
  const [cuisine, setCuisine] = useState('');
  if (!data) return null;

  /** 品类和菜系是两个始终可见、同时生效的独立维度。 */
  const byDish = dishType
    ? data.recipes.filter((r) =>
        (DISH_TYPES.find((d) => d.value === dishType)?.match ?? []).some((m) =>
          r.cuisines.includes(m),
        ),
      )
    : data.recipes;
  const cuisineOptions = [
    { value: '', label: '全部' },
    ...[...new Set(data.recipes.flatMap((r) => r.cuisines))]
      .filter((c) => CUISINE_FAMILIES.includes(c))
      .sort()
      .map((c) => ({ value: c, label: c })),
  ];
  const byCuisine = cuisine ? byDish.filter((r) => r.cuisines.includes(cuisine)) : byDish;

  /** 四个维度同时生效（AND）。 */
  let results = byCuisine;
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
  else if (source === 'recent')
    results = results.filter((r) => data.demoState.recentRecipeIds.includes(r.id));
  const kw = query.trim();
  if (kw)
    results = results.filter((r) =>
      `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.includes(kw),
    );

  return (
    <>
      <div className="row between recipe-head-row">
        <SectionTitle icon="search">找到想做的那道菜</SectionTitle>
        <div className="recipe-tools">
          <button
            type="button"
            className={`recipe-tool icon-button${source === 'recent' ? ' is-active' : ''}`}
            data-label="最近看过"
            aria-label="最近看过"
            aria-pressed={source === 'recent'}
            title="最近看过"
            onClick={() => setSource(source === 'recent' ? '' : 'recent')}
          >
            <Icon name="clock" size={22} />
          </button>
          <button
            type="button"
            className={`recipe-tool icon-button${source === 'mine' ? ' is-active' : ''}`}
            data-label="我的菜谱"
            aria-label="我的菜谱"
            aria-pressed={source === 'mine'}
            title="我的菜谱"
            onClick={() => setSource(source === 'mine' ? '' : 'mine')}
          >
            <Icon name="book" size={22} />
          </button>
          <button
            type="button"
            className={`recipe-tool icon-button${source === 'favorites' ? ' is-active' : ''}`}
            data-label="我的收藏"
            aria-label="我的收藏"
            aria-pressed={source === 'favorites'}
            title="我的收藏"
            onClick={() => setSource(source === 'favorites' ? '' : 'favorites')}
          >
            <Icon name="heart" size={22} />
          </button>
          <Link
            className="button icon-button recipe-tool recipe-tool-new"
            to="/recipes/new"
            data-label="新建菜谱"
            aria-label="新建菜谱"
            title="新建菜谱"
          >
            <Icon name="plus" size={24} />
          </Link>
        </div>
      </div>
      {pickMode ? (
        <p role="status" className="notice">
          {pickForDiary
            ? '正在为美食日记挑菜：选中后会自动回到日记页。'
            : '正在为饮食计划挑菜：选中后会自动回到计划页替换。'}
          <Link to={pickForDiary ? '/diary?pickReturn=1' : '/planner'}>
            放弃选择，返回{pickForDiary ? '日记' : '计划'}
          </Link>
        </p>
      ) : null}

      {/* 四个并列维度：一行一个维度，选项平铺，第一个永远是「全部」 */}
      <div className="tile-rows">
        <TileRow
          label="餐次"
          icon="bowl"
          options={[
            { value: '', label: '全部' },
            ...meals.map((m) => ({ value: m, label: mealLabels[m] })),
          ]}
          value={meal}
          onChange={setMeal}
        />
        <TileRow
          label="时间"
          icon="clock"
          options={[
            { value: '', label: '全部' },
            ...TIME_RANGES.map((t) => ({ value: t.value, label: t.label })),
          ]}
          value={timeRange}
          onChange={setTimeRange}
        />
        <TileRow
          label="品类"
          icon="tag"
          options={[
            { value: '', label: '全部' },
            ...DISH_TYPES.map((d) => ({ value: d.value, label: d.label })),
          ]}
          value={dishType}
          onChange={(v) => {
            setDishType(v);
          }}
        />
        <TileRow
          label="菜系"
          icon="compass"
          options={cuisineOptions}
          value={cuisine}
          onChange={setCuisine}
        />
      </div>

      {results.length ? (
        <div className="grid">
          {results.map((r) => (
            <div className="pick-cell" key={r.id}>
              <RecipeCard recipe={r} />
              {pickMode ? (
                <button
                  type="button"
                  className="pick-choose"
                  onClick={() => {
                    if (pickForDiary) {
                      const draft = readDiaryPick();
                      if (draft) writeDiaryPick({ ...draft, recipeId: r.id });
                      navigate('/diary?pickReturn=1');
                      return;
                    }
                    try {
                      const pending = sessionStorage.getItem('zhiweimi:plan-pick');
                      sessionStorage.setItem(
                        'zhiweimi:plan-pick',
                        JSON.stringify({ ...JSON.parse(pending ?? '{}'), recipeId: r.id }),
                      );
                    } catch {
                      // 存储失败就只是回到计划页
                    }
                    navigate('/planner');
                  }}
                >
                  选它
                </button>
              ) : null}
            </div>
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
  const foodIngredients = recipe.ingredients.filter((i) => !isSeasoning(i));
  const seasonings = recipe.ingredients.filter(isSeasoning);
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
              type="button"
              className={`secondary icon-button${recipe.favorite ? ' is-favorite' : ''}`}
              aria-label={recipe.favorite ? '取消收藏' : '收藏'}
              title={recipe.favorite ? '取消收藏' : '收藏'}
              onClick={() => void run(() => repositories.recipes.favorite(recipe), '收藏已更新')}
            >
              <Icon name={recipe.favorite ? 'heart-filled' : 'heart'} />
            </button>
            {recipe.status === 'published' && (
              <Link
                className="button icon-text-button"
                to={`/cook/${recipe.id}`}
                aria-label="开始烹饪"
                title="开始烹饪"
              >
                <Icon name="flame" />
                <span>开火</span>
              </Link>
            )}
            <Link
              className="button secondary icon-button"
              to={`/recipes/${recipe.id}/edit`}
              aria-label={recipe.sourceType === 'user' ? '编辑菜谱' : '创建副本'}
              title={recipe.sourceType === 'user' ? '编辑菜谱' : '创建副本'}
            >
              <Icon name={recipe.sourceType === 'user' ? 'pencil' : 'copy'} />
            </Link>
            {recipe.sourceType === 'user' && (
              <button
                type="button"
                className="danger icon-button"
                aria-label="删除菜谱"
                title="删除菜谱"
                onClick={async () => {
                  if (
                    confirm('删除菜谱？关联日记会保留，计划中的引用将移除。') &&
                    (await run(() => repositories.recipes.delete(recipe.id), ''))
                  )
                    navigate('/recipes');
                }}
              >
                <Icon name="trash" />
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="card recipe-uses">
        <div className="recipe-ingredients-heading">
          <h2 className="cooking-section-title">
            <span className="cooking-title-icon">
              <Icon name="bowl" size={26} />
            </span>
            <span>食材与调味</span>
          </h2>
          <Link className="button secondary" to="/utensils#my-fridge">
            <Icon name="fridge" size={22} />
            前往冰箱
          </Link>
        </div>
        <div className="ingredient-split">
          <div className="ingredient-column">
            <h3>食材</h3>
            {foodIngredients.length ? (
              foodIngredients.map((i) => (
                <p key={i.id}>
                  <span className="ingredient-name">
                    <FoodIcon name={i.name} size={40} />
                    <span>{i.name}</span>
                  </span>
                  <small>
                    {`${i.amount ?? '适量'} ${i.unit ?? ''}`.trim()}
                    {i.note ? ` · ${i.note}` : ''}
                  </small>
                </p>
              ))
            ) : (
              <p className="muted">无</p>
            )}
          </div>
          <div className="ingredient-column seasoning-column">
            <h3>调味料</h3>
            {seasonings.length ? (
              seasonings.map((i) => (
                <p key={i.id}>
                  <span className="ingredient-name">
                    <FoodIcon name={i.name} size={40} />
                    <span>{i.name}</span>
                  </span>
                  <small>{`${i.amount ?? '适量'} ${i.unit ?? ''}`.trim()}</small>
                </p>
              ))
            ) : (
              <p className="muted">无</p>
            )}
          </div>
        </div>
      </section>
      <section className="card recipe-steps">
        <h2 className="cooking-section-title">
          <span className="cooking-title-icon">
            <Icon name="pot" size={26} />
          </span>
          <span>烹饪步骤</span>
        </h2>
        <ol className="step-timeline">
          {recipe.steps.map((s, i) => (
            <li className="timeline-step" key={s.id}>
              <span className="timeline-number" aria-hidden="true">
                {i + 1}
              </span>
              <div className="timeline-body">
                <p>
                  <StepText text={s.instruction} ingredients={recipe.ingredients} />
                </p>
                {s.image && (
                  <Image image={s.image} alt={`步骤${i + 1}`} className="upload-preview" />
                )}
              </div>
            </li>
          ))}
        </ol>
        {recipe.notes && <p className="recipe-notes">{recipe.notes}</p>}
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
    const value = cleanRecipe({
      ...recipe,
      status,
      cuisines: recipe.cuisines.map((s) => s.trim()).filter(Boolean),
      flavorTags: recipe.flavorTags.map((s) => s.trim()).filter(Boolean),
      ingredientTags: recipe.ingredients.map((i) => i.name).filter(Boolean),
      steps: recipe.steps.map((s, i) => ({ ...s, order: i + 1 })),
    });
    try {
      validateRecipe(value);
      setError('');
      if (
        await run(
          () =>
            source?.sourceType === 'user'
              ? repositories.recipes.update(value)
              : repositories.recipes.create(value),
          '已保存',
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
            className="secondary icon-button"
            disabled={i === 0}
            aria-label={`上移食材${i + 1}`}
            title="上移食材"
            onClick={() => {
              const items = [...recipe.ingredients];
              [items[i - 1], items[i]] = [items[i], items[i - 1]];
              update({ ingredients: items });
            }}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="secondary icon-button"
            aria-label={`删除食材${i + 1}`}
            title="删除食材"
            onClick={() => update({ ingredients: recipe.ingredients.filter((_, j) => j !== i) })}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary icon-text-button"
        onClick={() => update({ ingredients: [...recipe.ingredients, { id: id(), name: '' }] })}
      >
        <Icon name="plus" />
        <span>添加食材</span>
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
              className="secondary icon-button"
              disabled={i === 0}
              aria-label={`上移步骤${i + 1}`}
              title="上移步骤"
              onClick={() => {
                const items = [...recipe.steps];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                update({ steps: items });
              }}
            >
              <Icon name="up" />
            </button>
            <button
              type="button"
              className="secondary icon-button"
              aria-label={`删除步骤${i + 1}`}
              title="删除步骤"
              onClick={() => update({ steps: recipe.steps.filter((_, j) => j !== i) })}
            >
              <Icon name="trash" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secondary icon-text-button"
        onClick={() =>
          update({
            steps: [...recipe.steps, { id: id(), order: recipe.steps.length + 1, instruction: '' }],
          })
        }
      >
        <Icon name="plus" />
        <span>添加步骤</span>
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

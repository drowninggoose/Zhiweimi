import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { filterRecipes, validateRecipe, type RecipeFilters } from '../services/recipeService';
import { id, stamp, meals, mealLabels, type Recipe } from '../types/models';
export function RecipesPage() {
  const { data } = useData();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<RecipeFilters>({
    query: params.get('q') ?? '',
    ingredients: params.get('ingredients')?.split(',') ?? [],
  });
  if (!data) return null;
  const results = filterRecipes(data.recipes, filters);
  const update = (next: Partial<RecipeFilters>) => setFilters({ ...filters, ...next });
  return (
    <>
      <div className="row between">
        <h2>找到想做的那道菜</h2>
        <Link className="button" to="/recipes/new">
          新建菜谱
        </Link>
      </div>
      <section className="card fields">
        <div className="row">
          <input
            aria-label="菜谱搜索"
            placeholder="菜名或食材"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          <select
            aria-label="菜系"
            onChange={(e) => update({ cuisine: e.target.value })}
            value={filters.cuisine ?? ''}
          >
            <option value="">全部菜系</option>
            {[...new Set(data.recipes.flatMap((r) => r.cuisines))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="餐次"
            value={filters.meal ?? ''}
            onChange={(e) => update({ meal: e.target.value })}
          >
            <option value="">全部餐次</option>
            {meals.map((m) => (
              <option key={m} value={m}>
                {mealLabels[m]}
              </option>
            ))}
          </select>
          <select
            aria-label="口味"
            value={filters.flavor ?? ''}
            onChange={(e) => update({ flavor: e.target.value })}
          >
            <option value="">全部口味</option>
            {[...new Set(data.recipes.flatMap((r) => r.flavorTags))].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            aria-label="难度"
            value={filters.difficulty ?? ''}
            onChange={(e) => update({ difficulty: e.target.value })}
          >
            <option value="">全部难度</option>
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="advanced">进阶</option>
          </select>
          <select
            aria-label="用时"
            value={filters.maxMinutes ?? ''}
            onChange={(e) => update({ maxMinutes: Number(e.target.value) || undefined })}
          >
            <option value="">不限用时</option>
            <option value="15">15分钟内</option>
            <option value="30">30分钟内</option>
          </select>
        </div>
        <div className="row">
          {[...new Set(data.recipes.flatMap((r) => r.ingredientTags))].map((i) => (
            <label key={i}>
              <input
                type="checkbox"
                checked={filters.ingredients?.includes(i) ?? false}
                onChange={(e) =>
                  update({
                    ingredients: e.target.checked
                      ? [...(filters.ingredients ?? []), i]
                      : filters.ingredients?.filter((x) => x !== i),
                  })
                }
              />
              {i}
            </label>
          ))}
        </div>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={!!filters.mine}
              onChange={(e) => update({ mine: e.target.checked })}
            />
            我的菜谱
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!filters.favorites}
              onChange={(e) => update({ favorites: e.target.checked })}
            />
            我的收藏
          </label>
          <button
            className="secondary"
            onClick={() => {
              setFilters({});
              setParams({});
            }}
          >
            清除筛选
          </button>
          <span>{results.length} 道菜</span>
        </div>
      </section>
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
            {recipe.sourceType === 'demo' ? '演示菜谱' : '我的菜谱'} ·{' '}
            {recipe.status === 'draft' ? '草稿' : '已发布'}
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
              {recipe.sourceType === 'demo' ? '创建副本' : '编辑菜谱'}
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
            {s.timerSeconds && <p>{s.timerSeconds}秒计时</p>}
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
          ...(source.sourceType === 'demo' ? stamp() : {}),
          sourceType: 'user',
          name: source.sourceType === 'demo' ? `${source.name}（我的版本）` : source.name,
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
        {source?.sourceType === 'demo' ? '创建用户菜谱副本' : recipeId ? '编辑菜谱' : '新建菜谱'}
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
          <label>
            计时秒数
            <input
              type="number"
              value={step.timerSeconds ?? ''}
              onChange={(e) =>
                update({
                  steps: recipe.steps.map((x, j) =>
                    j === i
                      ? { ...x, timerSeconds: e.target.value ? Number(e.target.value) : undefined }
                      : x,
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

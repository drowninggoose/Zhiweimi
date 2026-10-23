import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload, RecipeCard } from '../components/common';
import { FoodIcon } from '../components/FoodIcon';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { StarRating } from '../components/StarRating';
import { StepText } from '../components/StepText';
import { filterRecipes } from '../services/recipeService';
import { adaptInstructionForUtensils } from '../services/cookingService';
import { isSeasoning } from '../services/ingredientGroups';
import { personalizeRecipe } from '../services/preferenceMemoryService';
import { adjustCookingSteps, type CookingAdjustment } from '../services/aiService';
import { buildVocabulary, prepareAudio, transcribe } from '../services/voiceService';
import { formatSavedAgo, useCookingProgress, type CookingDraft } from '../hooks/useCookingProgress';
import {
  meals,
  mealLabels,
  id,
  stamp,
  today,
  type CookingProgress,
  type MealType,
  type PreferenceMemory,
  type Recipe,
  type RecipeStep,
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
        <SectionTitle icon="clock">继续上次的烹饪</SectionTitle>
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
                className="secondary icon-button"
                aria-label={`删除${item.recipeName}的进度`}
                title="删除进度"
                onClick={() => void removeProgress(item.recipeId, item.recipeName)}
              >
                <Icon name="trash" />
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
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  if (!data) return null;
  let recipes = filterRecipes(data.recipes, { query, favorites: tab === 'favorites' }).filter(
    (r) => r.status === 'published',
  );
  if (tab === 'recent')
    recipes = recipes.filter((r) => data.demoState.recentRecipeIds.includes(r.id));
  const stats = [
    {
      label: '用户菜谱',
      icon: 'book' as const,
      count: data.recipes.filter((recipe) => recipe.sourceType === 'user').length,
      to: '/recipes?source=mine',
    },
    { label: '美食日记', icon: 'camera' as const, count: data.diaryEntries.length, to: '/diary' },
    { label: '饮食计划', icon: 'calendar' as const, count: data.mealPlans.length, to: '/planner' },
    {
      label: '家庭食材',
      icon: 'fridge' as const,
      count: data.pantryItems.filter((item) => item.status === 'available').length,
      to: '/utensils',
    },
    {
      label: '我的收藏',
      icon: 'heart' as const,
      count: data.recipes.filter((recipe) => recipe.favorite).length,
      to: '/recipes?source=favorites',
    },
  ];
  return (
    <>
      <div className="cook-dashboard-head">
        <span className="section-kicker">LOCAL KITCHEN DATA</span>
        <SectionTitle icon="chart">本地数据，一目了然</SectionTitle>
      </div>
      <div className="cook-stats">
        {stats.map((item, index) => (
          <Link
            className="cook-stat"
            to={item.to}
            key={item.label}
            aria-label={`${item.label} ${item.count}`}
            style={{ animationDelay: `${index * -0.65}s` }}
          >
            <span
              className="stat-ripple"
              aria-hidden="true"
              style={{ animationDelay: `${index * 0.45}s` }}
            />
            <span className="cook-stat-icon" aria-hidden="true">
              <Icon name={item.icon} size={22} />
            </span>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
      <SectionTitle icon="flame">今天从哪道菜开始？</SectionTitle>
      <ContinueCooking />
      <div className="card row cook-tabs-row">
        <input
          aria-label="烹饪菜谱搜索"
          value={query}
          placeholder="搜索菜名或食材"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cook-tabs">
          <button
            type="button"
            className={`cook-tab${tab === 'all' ? ' is-active' : ''}`}
            onClick={() => navigate('/recipes')}
          >
            全部菜谱
          </button>
          <button
            type="button"
            className={`cook-tab cook-tab-icon${tab === 'recent' ? ' is-active' : ''}`}
            data-label="最近查看"
            aria-label="最近查看"
            title="最近查看"
            aria-pressed={tab === 'recent'}
            onClick={() => setTab('recent')}
          >
            <Icon name="clock" size={21} />
          </button>
          <button
            type="button"
            className={`cook-tab cook-tab-icon${tab === 'favorites' ? ' is-active' : ''}`}
            data-label="已收藏"
            aria-label="已收藏"
            title="已收藏"
            aria-pressed={tab === 'favorites'}
            onClick={() => setTab('favorites')}
          >
            <Icon name="heart" size={21} />
          </button>
        </div>
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
function ingredientKey(value: string) {
  return value.replace(/[\s（）()]/g, '').trim();
}

function fridgeHas(name: string, fridgeNames: string[]) {
  const key = ingredientKey(name);
  if (!key) return false;
  // 只做同名匹配：冰箱里有“番茄”不该把“番茄酱”也自动勾上。
  return fridgeNames.some((item) => ingredientKey(item) === key);
}

export function CookingPrepare() {
  const { recipeId } = useParams();
  const { data, run } = useData();
  const navigate = useNavigate();
  const recipe = data?.recipes.find((r) => r.id === recipeId && r.status === 'published');
  const fridgeNames = useMemo(
    () =>
      (data?.pantryItems ?? [])
        .filter((item) => item.status === 'available')
        .map((item) => item.name),
    [data?.pantryItems],
  );
  const autoChecked = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const item of recipe?.ingredients ?? []) {
      next[item.id] = fridgeHas(item.name, fridgeNames);
    }
    return next;
  }, [recipe, fridgeNames]);
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const isChecked = (id: string) => manualChecks[id] ?? autoChecked[id] ?? false;
  const foodIngredients = recipe?.ingredients.filter((item) => !isSeasoning(item)) ?? [];
  const [memories, setMemories] = useState<PreferenceMemory[]>([]);

  useEffect(() => {
    let active = true;
    void repositories.preferenceMemory
      .active()
      .then((list) => {
        if (active) setMemories(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const personalization = useMemo(
    () => (recipe ? personalizeRecipe(recipe, memories, data?.preferences) : null),
    [recipe, memories, data?.preferences],
  );

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
    // 每次开始烹饪都重新读取记忆库，避免用打开页面时的旧偏好。
    const activeMemories = await repositories.preferenceMemory.active();
    const tuned = personalizeRecipe(target, activeMemories, data!.preferences);
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
          adaptedSteps: tuned.steps,
          adaptationSummary: tuned.summary,
          rating: '★★★★☆',
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
        <SectionTitle icon="flame">准备制作 {recipe.name}</SectionTitle>
        <div className="memory-tune">
          <div className="memory-tune-title">
            <span className="section-kicker">AI TASTE MEMORY</span>
            <strong>口味记忆</strong>
          </div>
          <div className="memory-tune-chips">
            {(personalization?.notes ?? []).length ? (
              personalization?.notes.map((note) => <span key={note}>{note}</span>)
            ) : (
              <span className="memory-tune-empty">暂未设置偏好</span>
            )}
          </div>
          <Link className="memory-tune-link" to="/settings">
            调整口味
          </Link>
        </div>
        <div className="cook-ingredients">
          {foodIngredients.map((i) => {
            const checked = isChecked(i.id);
            return (
              <button
                type="button"
                className={`cook-ingredient${checked ? ' is-checked' : ''}`}
                key={i.id}
                aria-pressed={checked}
                aria-label={`${checked ? '取消勾选' : '勾选'}${i.name}`}
                onClick={() =>
                  setManualChecks((current) => ({
                    ...current,
                    [i.id]: !(current[i.id] ?? autoChecked[i.id] ?? false),
                  }))
                }
              >
                <span className="ingredient-tick" aria-hidden="true">
                  {checked ? <Icon name="check" size={16} /> : null}
                </span>
                <FoodIcon name={i.name} size={36} />
                <strong>{i.name}</strong>
                <span className="cook-amount">
                  {`${i.amount ?? '适量'} ${i.unit ?? ''}`.trim()}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cook-ingredient-foot">
          <span className="muted">
            冰箱已备 {foodIngredients.filter((item) => isChecked(item.id)).length} /{' '}
            {foodIngredients.length} 样食材
          </span>
          <Link to="/utensils">去我的厨房补货</Link>
        </div>
        <button className="right-action" onClick={() => void startSteps()}>
          准备完成，开始分步烹饪
        </button>
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
      originalRecipe={recipe}
      saved={progress.initial}
      onSave={progress.save}
      onDiscard={progress.discard}
    />
  );
}

/** 分步烹饪主体：状态初值来自上次保存的进度，之后每次改动自动保存。 */
function CookingStepsView({
  recipe,
  originalRecipe,
  saved,
  onSave,
  onDiscard,
}: {
  recipe: Recipe;
  originalRecipe: Recipe;
  saved: CookingProgress | null;
  onSave: (draft: CookingDraft) => void;
  onDiscard: () => Promise<void>;
}) {
  const { data, run } = useData();
  const navigate = useNavigate();
  const [workingSteps, setWorkingSteps] = useState<RecipeStep[]>(recipe.steps);
  const maxIndex = Math.max(workingSteps.length - 1, 0);
  const [index, setIndex] = useState(() => Math.min(Math.max(saved?.stepIndex ?? 0, 0), maxIndex));
  const [complete, setComplete] = useState(() => Boolean(saved?.completed));
  const [image, setImage] = useState<StoredImage | undefined>(saved?.image);
  const [rating, setRating] = useState(saved?.rating || '★★★★☆');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [date, setDate] = useState(saved?.date || today());
  const [meal, setMeal] = useState<MealType>(saved?.mealType || 'dinner');
  /** 已经结束（保存日记 / 仅完成），不再自动保存。 */
  const [finished, setFinished] = useState(false);
  const utensilChoices = useMemo(() => saved?.utensilChoices ?? {}, [saved]);
  const cookingUtensilId = saved?.cookingUtensilId;
  const [adaptationSummary, setAdaptationSummary] = useState(saved?.adaptationSummary ?? '');
  const adaptedSteps = workingSteps;
  const step = workingSteps[index];

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
    rating,
    notes,
    date,
    meal,
    image,
  ]);

  async function saveDiary() {
    // 用户没上传成品照时，沿用原菜谱封面。
    const diaryImage = image ?? recipe.coverImage;
    const imageUrl = !image && !recipe.coverImage ? recipe.coverUrl : undefined;
    const entry = {
      ...stamp(),
      date,
      mealType: meal,
      dishName: recipe.name,
      recipeId: recipe.id,
      image: diaryImage,
      imageUrl,
      tasteRating: rating,
      notes,
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
      <SectionTitle icon="camera">完成啦，记录这一餐</SectionTitle>
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
        <StarRating value={rating} onChange={setRating} />
      </div>
      <label>
        心得
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="row complete-actions">
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
    </section>
  ) : (
    <>
      <section className="card cooking-step">
        <span className="tag">
          步骤 {index + 1} / {workingSteps.length}
        </span>
        <h2>{recipe.name}</h2>
        <p className="step-instruction">
          <StepText
            text={adaptInstructionForUtensils(
              step.instruction,
              recipe.ingredients,
              data?.utensils ?? [],
            )}
            ingredients={recipe.ingredients}
          />
        </p>
        {step.image && (
          <Image image={step.image} alt={`步骤${index + 1}`} className="upload-preview" />
        )}
        <CookingStepAssistant
          recipe={originalRecipe}
          steps={workingSteps}
          stepIndex={index}
          summary={adaptationSummary}
          tastePreferences={data?.preferences.flavorPreferences ?? []}
          onAdjusted={(nextSteps, result) => {
            setWorkingSteps(nextSteps);
            setAdaptationSummary(result.summary);
          }}
          onRestore={() => {
            const completed = workingSteps.slice(0, index + 1);
            const originalRemaining = originalRecipe.steps.slice(index + 1);
            setWorkingSteps(
              [...completed, ...originalRemaining].map((item, order) => ({ ...item, order })),
            );
            setAdaptationSummary('');
          }}
        />
        <div className="row between">
          <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            上一步
          </button>
          {index < workingSteps.length - 1 ? (
            <button onClick={() => setIndex(index + 1)}>下一步</button>
          ) : (
            <button onClick={() => setComplete(true)}>完成烹饪</button>
          )}
        </div>
      </section>
    </>
  );
}

type AssistantState = 'idle' | 'recording' | 'transcribing' | 'thinking';

function CookingStepAssistant({
  recipe,
  steps,
  stepIndex,
  summary,
  tastePreferences,
  onAdjusted,
  onRestore,
}: {
  recipe: Recipe;
  steps: RecipeStep[];
  stepIndex: number;
  summary: string;
  tastePreferences: string[];
  onAdjusted: (steps: RecipeStep[], result: CookingAdjustment) => void;
  onRestore: () => void;
}) {
  const [text, setText] = useState('');
  const [state, setState] = useState<AssistantState>('idle');
  const [reply, setReply] = useState('');
  const [changes, setChanges] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  useEffect(
    () => () => {
      recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function submit(value = text) {
    const feedback = value.trim();
    if (!feedback || state !== 'idle') return;
    setState('thinking');
    setError('');
    try {
      const result = await adjustCookingSteps(recipe, steps, stepIndex, feedback, tastePreferences);
      const prefix = steps.slice(0, stepIndex + 1);
      const remaining = result.remainingSteps.map((item, offset) => ({
        ...item,
        durationSeconds: item.durationSeconds ?? undefined,
        id: id(),
        order: prefix.length + offset,
      }));
      const next = [...prefix, ...remaining].map((item, order) => ({ ...item, order }));
      onAdjusted(next, result);
      setReply(result.reply);
      setChanges(result.changes.map((item) => item.description));
      setWarnings(result.warnings);
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setState('idle');
    }
  }

  async function startRecording() {
    if (!supported || state !== 'idle') return;
    setError('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const instance = new MediaRecorder(media);
      recorder.current = instance;
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        const blob = new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' });
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        void (async () => {
          setState('transcribing');
          try {
            const result = await transcribe(await prepareAudio(blob), buildVocabulary(recipe));
            setText(result.text);
            setState('idle');
            await submit(result.text);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setState('idle');
          }
        })();
      };
      instance.start();
      setState('recording');
    } catch (cause) {
      setError(cause instanceof Error ? `无法使用麦克风：${cause.message}` : '无法使用麦克风');
    }
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  return (
    <div className="step-ai" role="region" aria-label="AI 味道调整助手">
      <div className="step-ai-head">
        <span className="step-ai-mark" aria-hidden="true">
          <Icon name="bowl" size={26} />
        </span>
        <span>
          <strong>尝一口，告诉知味咪</strong>
        </span>
        {summary && (
          <button className="step-ai-restore" type="button" onClick={onRestore}>
            恢复原后续步骤
          </button>
        )}
      </div>
      <div className="step-ai-compose">
        <textarea
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="例如：现在尝起来有点咸，后面怎么补救？"
          disabled={state !== 'idle'}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          className={`secondary step-ai-mic${state === 'recording' ? ' is-recording' : ''}`}
          disabled={!supported || (state !== 'idle' && state !== 'recording')}
          onClick={state === 'recording' ? stopRecording : () => void startRecording()}
          title={supported ? '语音输入' : '当前浏览器不支持录音'}
        >
          {state === 'recording' ? '停止' : '语音'}
        </button>
        <button
          type="button"
          disabled={!text.trim() || state !== 'idle'}
          onClick={() => void submit()}
        >
          {state === 'thinking'
            ? '正在调整…'
            : state === 'transcribing'
              ? '识别中…'
              : '调整后续步骤'}
        </button>
      </div>
      {(reply || changes.length > 0) && (
        <div className="step-ai-result" aria-live="polite">
          {reply && <strong>{reply}</strong>}
          {changes.length > 0 && (
            <ul>
              {changes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {warnings.map((item) => (
            <p className="step-ai-warning" key={item}>
              注意：{item}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

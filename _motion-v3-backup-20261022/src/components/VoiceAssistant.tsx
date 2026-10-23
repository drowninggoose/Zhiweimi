import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { remedies } from '../services/cookingService';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { buildContext, type VoiceContext } from '../services/voiceService';
import type { Recipe } from '../types/models';

const STATUS_TEXT: Record<string, string> = {
  idle: '按一下麦克风开始说话',
  recording: '正在听… 说完再点一下',
  transcribing: '正在识别语音…',
  thinking: '正在想…',
  speaking: '正在回答',
};

const ORB_SIZE = 104;
const ORB_MARGIN = 14;
const ORB_STORAGE_KEY = 'zhiweimi:orb-position:v5';

type OrbPosition = { x: number; y: number };

function clampOrb(x: number, y: number, width: number, height: number): OrbPosition {
  return {
    x: Math.min(Math.max(ORB_MARGIN, x), Math.max(ORB_MARGIN, width - ORB_SIZE - ORB_MARGIN)),
    y: Math.min(Math.max(ORB_MARGIN, y), Math.max(ORB_MARGIN, height - ORB_SIZE - 40)),
  };
}

function readOrbPosition(): OrbPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  // 小助手固定在屏幕上：保存/恢复的是视口坐标，滚动不改变它。
  const fallback = {
    x: window.innerWidth - ORB_SIZE - 30,
    y: window.innerHeight - ORB_SIZE - 58,
  };
  try {
    const saved = window.localStorage.getItem(ORB_STORAGE_KEY);
    if (!saved) return clampOrb(fallback.x, fallback.y, window.innerWidth, window.innerHeight);
    const parsed = JSON.parse(saved) as Partial<OrbPosition> & { vw?: number };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return fallback;
    // 换到明显不同的屏幕宽度时回到默认右下角，避免把窄屏坐标带到桌面。
    if (typeof parsed.vw === 'number' && Math.abs(parsed.vw - window.innerWidth) > 160) {
      return clampOrb(fallback.x, fallback.y, window.innerWidth, window.innerHeight);
    }
    return clampOrb(parsed.x, parsed.y, window.innerWidth, window.innerHeight);
  } catch {
    return fallback;
  }
}

/** 用最朴素的方式按口味检索菜谱：模型只负责说理由，菜名必须来自真实菜谱库。 */
function pickRecipes(
  recipes: Recipe[],
  query: { flavors: string[]; exclude: string[] },
  limit = 3,
): Recipe[] {
  const flavours = query.flavors.map((item) => item.trim()).filter(Boolean);
  const excludes = query.exclude.map((item) => item.trim()).filter(Boolean);
  const safe = recipes.filter(
    (recipe) =>
      recipe.status === 'published' &&
      !excludes.some((word) =>
        recipe.ingredients.some((ingredient) => ingredient.name.includes(word)),
      ),
  );
  const matched = flavours.length
    ? safe.filter(
        (recipe) =>
          flavours.some(
            (flavor) =>
              recipe.flavorTags.some((tag) => tag.includes(flavor) || flavor.includes(tag)) ||
              recipe.name.includes(flavor) ||
              recipe.cuisines.some((cuisine) => cuisine.includes(flavor)),
          ) ||
          recipe.name.includes(flavours[0]),
      )
    : safe;
  const pool = matched.length ? matched : safe;
  return pool.slice(0, limit);
}

export function VoiceAssistant() {
  const { data } = useData();
  const [open, setOpen] = useState(false);
  const [tab] = useState<'now' | 'history'>('now');
  const [draft, setDraft] = useState('');
  const [orbPosition, setOrbPosition] = useState<OrbPosition>(readOrbPosition);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ pointerId: 0, startX: 0, startY: 0, orbX: 0, orbY: 0, moved: false });
  const suppressClickRef = useRef(false);
  /** 当前在做的菜，录音前就要知道（用于生成 ASR 热词）。 */
  const recipeRef = useRef<Recipe | undefined>(undefined);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setOrbPosition((current) =>
        clampOrb(current.x, current.y, window.innerWidth, window.innerHeight),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (dragging) return;
    try {
      window.localStorage.setItem(
        ORB_STORAGE_KEY,
        JSON.stringify({ ...orbPosition, vw: window.innerWidth }),
      );
    } catch {
      // 本地存储不可用时只影响记忆位置。
    }
  }, [dragging, orbPosition]);

  /** 找最近一条烹饪进度当作上下文（6 小时内有效）。 */
  const current = useCallback(async () => {
    try {
      const list = await repositories.cookingProgress.list();
      const latest = list[0];
      if (!latest) return null;
      const ageMs = Date.now() - new Date(latest.savedAt).getTime();
      if (ageMs > 6 * 60 * 60 * 1000) return null;
      const recipe = data?.recipes.find((item) => item.id === latest.recipeId);
      if (!recipe) return null;
      return { recipe, stepIndex: latest.stepIndex };
    } catch {
      return null;
    }
  }, [data]);

  // 打开面板或数据变化时，刷新「当前在做的菜」
  useEffect(() => {
    let active = true;
    void current().then((value) => {
      if (active) recipeRef.current = value?.recipe;
    });
    return () => {
      active = false;
    };
  }, [current, open]);

  const getContext = useCallback(async (): Promise<VoiceContext> => {
    const active = await current();
    if (!active) return {};
    recipeRef.current = active.recipe;
    return buildContext(active.recipe, active.stepIndex, {
      remedies: remedies as Record<string, string>,
      tastePreferences: data?.preferences.flavorPreferences ?? [],
      avoidIngredients: data?.preferences.avoidIngredients ?? [],
    });
  }, [current, data]);

  const getRecipe = useCallback(() => recipeRef.current, []);

  const recommend = useCallback(
    (query: { flavors: string[]; exclude: string[] }) =>
      data ? pickRecipes(data.recipes, query) : [],
    [data],
  );

  const assistant = useVoiceAssistant({ getContext, getRecipe, recommend });
  const { status, error, result, history } = assistant;

  const startDragging = (event: PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      orbX: orbPosition.x,
      orbY: orbPosition.y,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 某些触摸浏览器不支持 pointer capture，拖动仍可继续。
    }
    setDragging(true);
  };

  const moveOrb = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging || event.pointerId !== dragRef.current.pointerId) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 5) dragRef.current.moved = true;
    setOrbPosition(
      clampOrb(
        dragRef.current.orbX + dx,
        dragRef.current.orbY + dy,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  };

  const stopDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== dragRef.current.pointerId) return;
    suppressClickRef.current = dragRef.current.moved;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 已自动释放时忽略。
    }
  };

  const panelWidth = 396;
  const panelHeight = 560;
  const panelStyle: CSSProperties | undefined = (() => {
    if (viewport.width <= 640) return undefined;
    const wantedLeft = orbPosition.x - panelWidth - 18;
    const left =
      wantedLeft >= 16
        ? wantedLeft
        : Math.min(orbPosition.x + ORB_SIZE + 18, viewport.width - panelWidth - 16);
    return {
      left: Math.max(16, Math.min(left, viewport.width - panelWidth - 16)),
      top: Math.min(
        Math.max(16, orbPosition.y - 100),
        Math.max(16, viewport.height - panelHeight - 16),
      ),
      right: 'auto',
      bottom: 'auto',
    };
  })();

  if (!data) return null;

  return (
    <>
      <button
        type="button"
        className={`voice-fab voice-orb${assistant.recording ? ' recording' : ''}${dragging ? ' dragging' : ''}${open ? ' is-open' : ''}`}
        style={{ left: orbPosition.x, top: orbPosition.y, right: 'auto', bottom: 'auto' }}
        aria-label={open ? '收起语音助手' : '打开语音助手，可拖动换位'}
        aria-pressed={open}
        title="拖动换位，单击对话"
        onPointerDown={startDragging}
        onPointerMove={moveOrb}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (open) {
            assistant.cancel();
            setOpen(false);
          } else {
            setOpen(true);
            void assistant.refreshHistory();
          }
        }}
      >
        <span className="voice-orb-halo" aria-hidden="true" />
        <span className="voice-orb-ring" aria-hidden="true" />
        <img className="voice-orb-face" src="/app-icon.png" alt="" draggable={false} />
        <span className="voice-orb-badge" aria-hidden="true">
          {assistant.recording ? '●' : 'AI'}
        </span>
        <span className="voice-orb-label" aria-hidden="true">
          小助手
        </span>
      </button>

      {open && (
        <section className="voice-panel" style={panelStyle} aria-label="语音助手面板">
          <div className="voice-head">
            <div className="voice-title">
              <strong>知味咪小助手</strong>
            </div>
            <div className="row voice-head-actions">
              <button
                type="button"
                className="voice-close"
                aria-label="关闭语音助手"
                onClick={() => {
                  assistant.cancel();
                  setOpen(false);
                }}
              >
                ×
              </button>
            </div>
          </div>

          {tab === 'history' ? (
            <div className="voice-history">
              {history.length === 0 ? (
                <p className="muted">还没有对话记录。</p>
              ) : (
                history.map((item) => (
                  <article className="voice-history-item" key={item.id}>
                    <p className="voice-q">🗣 {item.userText}</p>
                    <p className="voice-a">🌿 {item.replyText}</p>
                    {item.detail?.length ? (
                      <ul className="voice-detail">
                        {item.detail.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    <small className="muted">
                      {new Date(item.createdAt).toLocaleString('zh-CN')} ·{' '}
                      {item.inputMode === 'voice' ? '语音' : '文字'}
                      {item.recipeName ? ` · ${item.recipeName}` : ''}
                      {item.recommendedRecipeIds?.length ? ` · 推荐 ${item.recommendedRecipeIds.length} 道` : ''}
                    </small>
                  </article>
                ))
              )}
              {history.length ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    if (confirm('清空全部对话记录？记忆不会受影响。')) {
                      await repositories.assistantMessages.clear();
                      await assistant.refreshHistory();
                    }
                  }}
                >
                  清空记录
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {status !== 'idle' && (
                <p className="voice-status muted">{STATUS_TEXT[status] ?? status}</p>
              )}

              {error ? (
                <p role="alert" className="error voice-error">
                  {error}
                </p>
              ) : null}

              <div className="row voice-controls">
                {status === 'recording' ? (
                  <button type="button" className="voice-mic recording" onClick={assistant.stopRecording}>
                    ⏹ 说完了
                  </button>
                ) : (
                  <button
                    type="button"
                    className="voice-mic"
                    disabled={!assistant.supported || assistant.busy || status === 'speaking'}
                    onClick={() => void assistant.startRecording()}
                  >
                    🎙️ 按住说话
                  </button>
                )}
                {status === 'speaking' ? (
                  <button type="button" className="secondary" onClick={assistant.cancel}>
                    停止朗读
                  </button>
                ) : null}
              </div>

              {!assistant.supported ? (
                <p className="muted">当前浏览器不支持录音，可以直接在下面输入问题。</p>
              ) : null}

              <form
                className="row voice-input"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!draft.trim()) return;
                  assistant.ask(draft);
                  setDraft('');
                }}
              >
                <input
                  aria-label="输入问题"
                  placeholder="也可以直接打字问，例如：菜有点淡怎么办"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" disabled={assistant.busy || !draft.trim()}>
                  问
                </button>
              </form>

              {result ? (
                <div className="voice-reply" aria-live="polite">
                  <p className="voice-q">🗣 {result.question}</p>
                  <p className="voice-answer">{result.answer}</p>
                  {result.actions.length ? (
                    <ul className="voice-actions">
                      {result.actions.map((action, index) => (
                        <li key={`${action.do}-${index}`}>
                          <strong>{action.do}</strong>
                          <span className="voice-action-meta">
                            {action.amount ? <span>用量：{action.amount}</span> : null}
                            {action.when ? <span>时机：{action.when}</span> : null}
                            {action.check ? <span>判断：{action.check}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {result.justRemembered.length ? (
                    <p className="voice-memory">
                      ✅ 已记住：{result.justRemembered.join('、')}
                      <Link to="/settings"> 去管理</Link>
                    </p>
                  ) : null}
                  {result.recommended.length ? (
                    <div className="voice-recommend">
                      <p className="muted">给你找到这几道：</p>
                      {result.recommended.map((recipe) => (
                        <Link key={recipe.id} className="voice-recipe" to={`/recipes/${recipe.id}`}>
                          <strong>{recipe.name}</strong>
                          <small>
                            {recipe.flavorTags.join(' · ') || '家常'} ·{' '}
                            {recipe.estimatedMinutes ? `${recipe.estimatedMinutes} 分钟` : '用时未知'}
                          </small>
                        </Link>
                      ))}
                    </div>
                  ) : result.wantRecommend ? (
                    <p className="voice-recipe-empty muted">
                      菜谱库里暂时没找到匹配的菜，换个说法再问一次试试（比如「来几道清淡的汤」）。
                    </p>
                  ) : null}
                  <p className="voice-hint muted">
                    建议仅供参考，具体火候与生熟请以你看到的实际情况为准。
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { remedies } from '../services/cookingService';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { useConfirm } from './dialogContext';
import { buildContext, type VoiceContext } from '../services/voiceService';
import type { Recipe } from '../types/models';

/**
 * 悬浮球尺寸与贴边后可见宽度。
 * 露出 38px（约六成）—— 太窄会不好点，这里保留足够的点击面。
 */
const FAB_SIZE = 64;
const FAB_VISIBLE = 38;
/** 离边缘多少像素内松手就吸附。 */
const EDGE_SNAP = 30;
const FAB_KEY = 'zhiweimi:voice-fab';

type FabPos = { x: number; y: number; docked: 'left' | 'right' | null };

/** 把坐标限制在视口内，避免球被拖到看不见的地方。 */
function clampFab(x: number, y: number) {
  const maxX = Math.max(0, window.innerWidth - FAB_SIZE);
  const maxY = Math.max(0, window.innerHeight - FAB_SIZE);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

/** 读取上次的位置；没有记录时默认落在右下角。 */
function readFabPos(): FabPos {
  try {
    const raw = localStorage.getItem(FAB_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Partial<FabPos>;
      if (typeof value.x === 'number' && typeof value.y === 'number') {
        return { ...clampFab(value.x, value.y), docked: value.docked ?? null };
      }
    }
  } catch {
    // 读取失败就用默认位置
  }
  return {
    x: Math.max(12, window.innerWidth - FAB_SIZE - 26),
    y: Math.max(12, window.innerHeight - FAB_SIZE - 26),
    docked: null,
  };
}

/** 从贴边状态恢复成完整可见的位置。 */
function unDock(docked: FabPos['docked']) {
  if (docked === 'right') return { x: window.innerWidth - FAB_SIZE - 12 };
  if (docked === 'left') return { x: 12 };
  return {};
}
const STATUS_TEXT: Record<string, string> = {
  idle: '按一下麦克风开始说话',
  recording: '正在听… 说完再点一下',
  transcribing: '正在识别语音…',
  thinking: '正在想…',
  speaking: '正在回答',
};

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
  const [tab, setTab] = useState<'now' | 'history'>('now');
  const [draft, setDraft] = useState('');
  /** 当前在做的菜，录音前就要知道（用于生成 ASR 热词）。 */
  const recipeRef = useRef<Recipe | undefined>(undefined);

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

  const confirm = useConfirm();
  const assistant = useVoiceAssistant({ getContext, getRecipe, recommend });
  const { status, error, result, history } = assistant;

  // ---- 悬浮球拖动与贴边隐藏 ----
  const [fab, setFab] = useState<FabPos>(readFabPos);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  // 窗口尺寸变化时把球拉回可视区域（只在事件回调里 setState）
  useEffect(() => {
    function onResize() {
      setFab((prev) => ({ ...prev, ...clampFab(prev.x, prev.y) }));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function saveFab(next: FabPos) {
    try {
      localStorage.setItem(FAB_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可用时忽略，仅影响下次打开的位置
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: fab.x,
      originY: fab.y,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.moved = true;
    setDragging(true);
    const next = clampFab(drag.originX + dx, drag.originY + dy);
    // 拖动时先解除贴边，松手后再判定
    setFab({ x: next.x, y: next.y, docked: null });
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag) return;

    // 只是点了一下：开/关面板；贴边状态下则唤醒并展开
    if (!drag.moved) {
      if (fab.docked) {
        setFab((prev) => {
          const next = { ...prev, ...unDock(prev.docked), docked: null as FabPos['docked'] };
          saveFab(next);
          return next;
        });
        setOpen(true);
        void assistant.refreshHistory();
      } else if (open) {
        assistant.cancel();
        setOpen(false);
      } else {
        setOpen(true);
        void assistant.refreshHistory();
      }
      return;
    }

    // 松手：靠近左右边缘就吸附，隐藏约三分之二
    let docked: FabPos['docked'] = null;
    let x = fab.x;
    if (fab.x <= EDGE_SNAP) {
      docked = 'left';
      x = 0;
    } else if (fab.x + FAB_SIZE >= window.innerWidth - EDGE_SNAP) {
      docked = 'right';
      x = window.innerWidth - FAB_SIZE;
    }
    const next: FabPos = { x, y: fab.y, docked };
    setFab(next);
    saveFab(next);
    if (docked) setOpen(false);
  }

  // 贴边时向右/向左移出屏幕，只留三分之一可见
  const hiddenOffset = FAB_SIZE - FAB_VISIBLE;
  const fabStyle: CSSProperties = {
    left: fab.x,
    top: fab.y,
    right: 'auto',
    bottom: 'auto',
    transform:
      fab.docked === 'right'
        ? `translateX(${hiddenOffset}px)`
        : fab.docked === 'left'
          ? `translateX(-${hiddenOffset}px)`
          : undefined,
    transition: dragging ? 'none' : 'left .2s ease, top .2s ease, transform .2s ease',
  };

  // 面板贴着球的左右一侧展开，并限制在视口内
  const panelWidth = 380;
  const panelLeft =
    fab.x + FAB_SIZE / 2 < window.innerWidth / 2
      ? Math.min(fab.x + FAB_SIZE + 12, window.innerWidth - panelWidth - 12)
      : Math.max(12, fab.x - panelWidth - 12);
  const panelTop = Math.min(Math.max(12, fab.y - 300), Math.max(12, window.innerHeight - 480));
  const panelStyle: CSSProperties = {
    left: Math.max(12, panelLeft),
    top: panelTop,
    right: 'auto',
    bottom: 'auto',
    maxHeight: 'min(70vh, 620px)',
  };

  if (!data) return null;

  return (
    <>
      <button
        type="button"
        className={`voice-fab${assistant.recording ? ' recording' : ''}${
          fab.docked ? ' docked' : ''
        }${dragging ? ' dragging' : ''}`}
        style={fabStyle}
        aria-label={
          fab.docked ? '唤醒语音助手' : open ? '收起语音助手' : '打开语音助手'
        }
        title={fab.docked ? '点击唤醒语音助手' : '可拖动，拖到边缘可收起'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
      >
        {assistant.recording ? '⏺' : fab.docked ? '💬' : '🎙️'}
      </button>

      {open && !fab.docked && (
        <section className="voice-panel" style={panelStyle} aria-label="语音助手面板">
          <div className="row between voice-head">
            <strong>知味咪小助手</strong>
            <div className="row voice-head-actions">
              <button
                type="button"
                className={tab === 'now' ? '' : 'secondary'}
                onClick={() => setTab('now')}
              >
                对话
              </button>
              <button
                type="button"
                className={tab === 'history' ? '' : 'secondary'}
                onClick={() => {
                  setTab('history');
                  void assistant.refreshHistory();
                }}
              >
                记录
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
                    const ok = await confirm({
                      title: '清空全部对话记录？',
                      message: '记忆与口味偏好不会受影响。',
                      confirmText: '清空记录',
                      danger: true,
                    });
                    if (ok) {
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
              <p className="voice-status muted">{STATUS_TEXT[status] ?? status}</p>

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

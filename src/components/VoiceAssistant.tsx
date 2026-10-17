import { useCallback, useEffect, useRef, useState } from 'react';
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

  const assistant = useVoiceAssistant({ getContext, getRecipe, recommend });
  const { status, error, result, history } = assistant;

  if (!data) return null;

  return (
    <>
      <button
        type="button"
        className={`voice-fab${assistant.recording ? ' recording' : ''}`}
        aria-label={open ? '收起语音助手' : '打开语音助手'}
        onClick={() => {
          if (open) {
            assistant.cancel();
            setOpen(false);
          } else {
            setOpen(true);
            void assistant.refreshHistory();
          }
        }}
      >
        {assistant.recording ? '⏺' : '🎙️'}
      </button>

      {open && (
        <section className="voice-panel" aria-label="语音助手面板">
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
                  {result.detail.length ? (
                    <ul className="voice-detail">
                      {result.detail.map((line) => (
                        <li key={line}>{line}</li>
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

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { understandPreferences } from '../services/aiService';
import { clearEnteredPortal } from '../components/portalStorage';
import { repositories } from '../db/repositories';
import {
  MEMORY_LABELS,
  deriveMemoryEvidence,
  extraPreferenceTags,
  memoryNote,
  preferenceTerms,
  type PreferenceTag,
} from '../services/preferenceMemoryService';
import type { PreferenceMemory } from '../types/models';

type SpeechRecognitionEventLike = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const target = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition;
}

function memoryReply(memories: PreferenceMemory[], evidenceCount: number) {
  if (!evidenceCount) return '我听到了。你可以直接说“少盐”“不吃香菜”“喜欢清淡”，我会记下来。';
  const active = memories.filter((item) => item.active).slice(-3);
  const notes = active.length
    ? active.map(memoryNote)
    : memories.slice(-3).map((item) => memoryNote(item));
  return `记住了：${notes.join('、')}。下次开火我会先按这些调整。`;
}

export function SettingsPage() {
  const { data, run } = useData();
  const [memories, setMemories] = useState<PreferenceMemory[]>([]);
  const [messages, setMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([
    { role: 'assistant', text: '说说你平时喜欢什么口味、不吃什么，我会记进记忆库。' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [chatError, setChatError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    let active = true;
    void repositories.preferenceMemory
      .list()
      .then((list) => {
        if (active) setMemories(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      recognitionRef.current?.stop();
    };
  }, []);

  if (!data) return null;

  const rawTags = extraPreferenceTags(memories, data.preferences);

  async function reloadMemories() {
    setMemories(await repositories.preferenceMemory.list());
  }

  async function sendMessage(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setMessages((current) => [...current, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    setChatError('');
    try {
      let evidence = deriveMemoryEvidence(question);
      let terms = preferenceTerms(question);
      let reply = '';
      let removeAvoid: string[] = [];
      try {
        const understood = await understandPreferences(
          question,
          messages,
          memories.map(memoryNote),
        );
        evidence = understood.memories;
        terms = { avoid: understood.avoid, liked: understood.liked };
        removeAvoid = understood.removeAvoid;
        reply = understood.reply;
      } catch {
        setChatError('大模型暂时无法连接，本次使用基础关键词识别；未识别的表达请稍后重试。');
      }
      if (evidence.length || terms.avoid.length || terms.liked.length || removeAvoid.length) {
        await run(async () => {
          for (const item of evidence) {
            await repositories.preferenceMemory.applyEvidence({
              dimension: item.dimension,
              polarity: item.polarity,
              source: item.source,
              evidence: item.evidence,
            });
          }
          const current = await repositories.preferences.getById();
          if (current) {
            const avoidIngredients = [
              ...new Set([...current.avoidIngredients, ...terms.avoid]),
            ].filter((item) => !removeAvoid.includes(item));
            const flavorPreferences = [...new Set([...current.flavorPreferences, ...terms.liked])];
            await repositories.preferences.update({
              ...current,
              avoidIngredients,
              flavorPreferences,
            });
          }
        }, '已保存');
      }
      const list = await repositories.preferenceMemory.list();
      setMemories(list);
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: reply || memoryReply(list, evidence.length) },
      ]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setChatError('当前浏览器不支持语音识别，请直接输入文字。');
      return;
    }
    setChatError('');
    const recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      setInput(text);
      void sendMessage(text);
    };
    recognition.onerror = (event) => {
      setChatError(event.error === 'not-allowed' ? '麦克风权限被拒绝。' : '没有听清，请再说一次。');
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function deleteMemory(memory: PreferenceMemory) {
    await run(() => repositories.preferenceMemory.remove(memory.dimension), '已保存');
    await reloadMemories();
  }

  async function deleteRawTag(tag: PreferenceTag) {
    const current = data!.preferences;
    const next =
      tag.kind === 'avoid'
        ? {
            ...current,
            avoidIngredients: current.avoidIngredients.filter((item) => item !== tag.value),
          }
        : {
            ...current,
            flavorPreferences: current.flavorPreferences.filter((item) => item !== tag.value),
          };
    await run(() => repositories.preferences.update(next), '已保存');
  }

  async function clearMemories() {
    if (!confirm('清空知味咪记住的所有口味偏好？')) return;
    await run(async () => {
      await repositories.preferenceMemory.clear();
      const current = await repositories.preferences.getById();
      if (current)
        await repositories.preferences.update({
          ...current,
          flavorPreferences: [],
          avoidIngredients: [],
        });
    }, '已保存');
    await reloadMemories();
  }

  async function factoryReset() {
    if (
      !confirm(
        '恢复出厂设置？菜谱库、厨具、日记、饮食计划、食材、偏好记忆、上传图片和全部设置都会被清空，回到第一次打开知味咪的状态。',
      )
    )
      return;
    if (await run(() => repositories.clear('all'), '已保存')) {
      clearEnteredPortal();
      window.location.assign('/');
    }
  }

  return (
    <>
      <section className="card preference-chat-card">
        <div className="preference-chat-head">
          <div>
            <span className="section-kicker">AI TASTE MEMORY</span>
            <SectionTitle icon="heart">我的偏好</SectionTitle>
          </div>
        </div>

        <div className="memory-library">
          <div className="row between">
            <h3>记忆库</h3>
            {(memories.length > 0 || rawTags.length > 0) && (
              <button
                type="button"
                className="secondary memory-clear"
                onClick={() => void clearMemories()}
              >
                清空记忆
              </button>
            )}
          </div>
          {memories.length || rawTags.length ? (
            <>
              {memories.length ? (
                <div className="memory-tag-groups">
                  {(['preference', 'avoid'] as const).map((group) => (
                    <div className="memory-tag-group" key={group}>
                      <h4>
                        <Icon name={group === 'avoid' ? 'fridge' : 'heart'} size={19} />
                        {group === 'avoid' ? '忌口' : '偏好'}
                      </h4>
                      <div className="memory-list">
                        {memories
                          .filter(
                            (memory) =>
                              (memory.dimension === 'disliked_ingredient') === (group === 'avoid'),
                          )
                          .map((memory) => (
                            <article
                              className={`memory-item${memory.active ? ' is-active' : ''}`}
                              key={memory.id}
                            >
                              <span className="memory-tag-icon">
                                <Icon
                                  name={
                                    memory.dimension === 'disliked_ingredient'
                                      ? 'close'
                                      : memory.dimension === 'spiciness'
                                        ? 'flame'
                                        : memory.dimension === 'sweetness'
                                          ? 'heart'
                                          : 'bowl'
                                  }
                                  size={23}
                                />
                              </span>
                              <div>
                                <strong>{memoryNote(memory)}</strong>
                                <small title={memory.evidence[memory.evidence.length - 1]?.text}>
                                  {MEMORY_LABELS[memory.dimension]} ·{' '}
                                  {memory.active ? '已记住' : `待确认 ${memory.positiveCount}/3`}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="icon-button memory-remove"
                                aria-label={`删除${memoryNote(memory)}记忆`}
                                title="删除这条记忆"
                                onClick={() => void deleteMemory(memory)}
                              >
                                <Icon name="close" size={14} />
                              </button>
                            </article>
                          ))}
                      </div>
                      {!memories.some(
                        (memory) =>
                          (memory.dimension === 'disliked_ingredient') === (group === 'avoid'),
                      ) && <span className="muted">暂无</span>}
                    </div>
                  ))}
                </div>
              ) : null}
              {rawTags.length ? (
                <div className="memory-extra-tags">
                  <h4>
                    <Icon name="tag" size={18} />
                    口味标签
                  </h4>
                  <div className="memory-extra-list">
                    {rawTags.map((tag) => (
                      <span
                        className={`memory-extra-chip${tag.kind === 'avoid' ? ' is-avoid' : ''}`}
                        key={`${tag.kind}-${tag.value}`}
                      >
                        <Icon name={tag.kind === 'avoid' ? 'close' : 'heart'} size={14} />
                        {tag.label}
                        <button
                          type="button"
                          aria-label={`删除${tag.label}标签`}
                          title="删除这条标签"
                          onClick={() => void deleteRawTag(tag)}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <small className="muted">这些标签也会参与开始烹饪时的口味调整。</small>
                </div>
              ) : null}
            </>
          ) : (
            <p className="memory-empty">还没有记忆。说一句“我口味偏淡，不吃香菜”试试。</p>
          )}
        </div>

        <div
          className="preference-chat-log"
          ref={chatLogRef}
          role="log"
          aria-label="口味偏好聊天记录"
          aria-live="polite"
          tabIndex={0}
          onScroll={(event) => {
            const log = event.currentTarget;
            followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
          }}
        >
          {messages.map((message, index) => (
            <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === 'assistant' ? '咪' : '我'}</span>
              <p>{message.text}</p>
            </div>
          ))}
          {busy && (
            <div className="chat-bubble assistant">
              <span>咪</span>
              <p>记一下…</p>
            </div>
          )}
        </div>

        {chatError && (
          <p role="alert" className="error">
            {chatError}
          </p>
        )}

        <form
          className="preference-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <button
            type="button"
            className={`chat-mic${listening ? ' is-listening' : ''}`}
            aria-label="语音输入偏好"
            title={listening ? '正在听…' : '语音输入偏好'}
            onClick={startVoice}
            disabled={listening || busy}
          >
            <Icon name="mic" size={20} />
          </button>
          <input
            aria-label="告诉知味咪你的偏好"
            placeholder="例如：口味清淡，少吃辣，不吃香菜"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            发送
          </button>
        </form>
      </section>

      <section className="card competition-panel">
        <div className="row between">
          <div>
            <span className="tag">COMPETITION DEMO</span>
            <SectionTitle icon="compass">比赛演示准备</SectionTitle>
            <p className="muted">
              一条路线验证：库存 → 推荐 → 计划 → 采购 → 烹饪 → 日记，评审现场照着点就能走完闭环。
            </p>
          </div>
        </div>
        <div className="readiness-grid">
          {[
            {
              ok: (data?.recipes.length ?? 0) > 0,
              label: '菜谱库',
              note: `${data?.recipes.length ?? 0} 道可核验数据`,
            },
            {
              ok: (data?.pantryItems.filter((item) => item.status === 'available').length ?? 0) > 0,
              label: '家庭库存',
              note: `${data?.pantryItems.filter((item) => item.status === 'available').length ?? 0} 项现有食材`,
            },
            {
              ok: (data?.utensils.length ?? 0) > 0,
              label: '厨具与 AI',
              note: data?.utensils.length ? `${data.utensils.length} 件厨具` : '建议先添加 1 件',
            },
            {
              ok: (data?.preferences.avoidIngredients.length ?? 0) > 0,
              label: '安全规则',
              note: data?.preferences.avoidIngredients.length ? '严格过滤已配置' : '建议设置演示忌口',
            },
          ].map((item) => (
            <article key={item.label} className={item.ok ? 'ready' : 'warning'}>
              <strong>{item.ok ? '✓' : '!'}</strong>
              <span>{item.label}</span>
              <small>{item.note}</small>
            </article>
          ))}
        </div>
        <div className="row">
          <button
            onClick={() => {
              if (
                confirm('加入番茄、鸡蛋、大米和葱作为演示库存？不会删除或覆盖现有数据。')
              )
                void run(() => repositories.prepareCompetitionDemo(), '比赛演示数据已准备好');
            }}
          >
            一键准备演示数据
          </button>
          <Link className="button secondary" to="/">
            从智能推荐开始
          </Link>
          <Link className="button secondary" to="/planner">
            验证计划与采购
          </Link>
          <Link className="button secondary" to="/utensils?new=1">
            验证 AI 降级
          </Link>
        </div>
        <p className="muted">
          演示建议：先设置一条严格忌口，再生成计划看采购清单，完成一道菜并确认扣减库存。
        </p>
      </section>

      <section className="card factory-reset">
        <SectionTitle icon="settings">恢复出厂设置</SectionTitle>
        <p>
          会清空菜谱库、厨具、日记、饮食计划、食材、偏好记忆、上传图片和全部设置，回到第一次打开知味咪的状态。此操作无法撤销。
        </p>
        <button className="danger right-action" onClick={() => void factoryReset()}>
          恢复出厂设置
        </button>
      </section>
    </>
  );
}

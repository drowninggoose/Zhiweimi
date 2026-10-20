/**
 * 首页的小猫形象：点一下会冒出一个说话气泡。
 *
 * 行为：
 * - 首屏进入时说一句问候（同一会话只说一次）；
 * - 点击必换一句（轮换制，不连续重复）；
 * - 场景按时段与烹饪状态判断：早上/中午/下午/傍晚/深夜、做菜中、刚做完；
 * - E 人模式：约一半概率会紧接着再补一句「接话」；
 * - 后台向本地网关要几句新鲜话术，拿到就存进本地池，下次优先用；
 * - 断网 / 未配置 Key 时自动退化为纯语料，功能不受影响。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import {
  lastLineId,
  pickFollowUp,
  pickLine,
  requestBanter,
  resolveTag,
  takeAiLine,
  takeGreeting,
  type MascotTag,
} from '../services/mascotService';

/** 气泡停留时间：首屏问候久一点，点击短一点。 */
const GREET_HOLD_MS = 5200;
const CLICK_HOLD_MS = 4200;
/** 接话气泡停留时间。 */
const FOLLOW_HOLD_MS = 2600;
/** 首屏问候延迟，避免和页面渲染抢注意力。 */
const GREET_DELAY_MS = 900;
/** 主句说多久之后接话（E 人也不能抢话）。 */
const CHATTER_DELAY_MS = 1500;
/** 接话出现前，允许 AI 结果替换主句的时间窗。 */
const AI_REPLACE_WINDOW_MS = CHATTER_DELAY_MS;
/** E 人模式的接话概率。 */
const CHATTER_RATE = 0.5;

type MascotContext = {
  cooking: boolean;
  finished: boolean;
  dishName?: string;
  stepIndex?: number;
};

export function Mascot() {
  const { data } = useData();
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const chatterTimer = useRef<number | undefined>(undefined);
  /** 每次点击自增，用于丢弃过期的 AI 替换结果 */
  const turn = useRef(0);
  /** 当前烹饪上下文（异步读取，不参与渲染） */
  const contextRef = useRef<MascotContext>({ cooking: false, finished: false });

  const clearTimers = useCallback(() => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    if (chatterTimer.current !== undefined) window.clearTimeout(chatterTimer.current);
    hideTimer.current = undefined;
    chatterTimer.current = undefined;
  }, []);

  const show = useCallback((value: string, holdMs: number) => {
    setText(value);
    setVisible(true);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), holdMs);
  }, []);

  /** 读一次烹饪进度，决定是「做菜中」还是「刚做完」。 */
  const refreshContext = useCallback(async () => {
    try {
      const list = await repositories.cookingProgress.list();
      const now = Date.now();
      const active = list.find(
        (item) =>
          item.stage === 'steps' &&
          !item.completed &&
          now - new Date(item.savedAt).getTime() < 6 * 3600_000,
      );
      const justFinished = list.find(
        (item) => item.completed && now - new Date(item.savedAt).getTime() < 30 * 60_000,
      );
      contextRef.current = {
        cooking: Boolean(active),
        finished: !active && Boolean(justFinished),
        dishName: active?.recipeName ?? justFinished?.recipeName,
        stepIndex: active?.stepIndex,
      };
    } catch {
      // 读不到就按普通场景处理
    }
  }, []);

  useEffect(() => {
    void refreshContext();
    function onUpdated() {
      void refreshContext();
    }
    window.addEventListener('zhiweimi:cooking-progress-updated', onUpdated);
    return () => window.removeEventListener('zhiweimi:cooking-progress-updated', onUpdated);
  }, [refreshContext]);

  // 数据就绪后再刷新一次（首屏时进度表可能还没读出来）
  useEffect(() => {
    if (data) void refreshContext();
  }, [data, refreshContext]);

  // 卸载时清掉计时器
  useEffect(() => clearTimers, [clearTimers]);

  // 首屏问候 + 顺手预取几句 AI 话术
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const greeting = takeGreeting();
      if (greeting) show(greeting.text, GREET_HOLD_MS);
      void requestBanter('greet');
    }, GREET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  const handleClick = useCallback(() => {
    clearTimers();
    const context = contextRef.current;
    const tag = resolveTag(new Date(), context);
    // 场景语之外再混一点通用点击语，避免同一类话反复出现
    const tags: MascotTag[] = tag === 'click' ? ['click'] : [tag, 'click'];
    const line = pickLine({ tag: tags, avoidId: lastLineId() });
    const myTurn = ++turn.current;
    show(line.text, CLICK_HOLD_MS);
    const mainUntil = Date.now() + AI_REPLACE_WINDOW_MS;

    // E 人模式：过一会儿再补一句
    if (Math.random() < CHATTER_RATE) {
      chatterTimer.current = window.setTimeout(() => {
        if (turn.current !== myTurn) return;
        const follow = pickFollowUp(lastLineId());
        show(follow.text, FOLLOW_HOLD_MS);
      }, CHATTER_DELAY_MS);
    }

    // 后台补充新鲜话术：趁主句还在，直接替换成 AI 那句
    void requestBanter(tag, {
      dishName: context.dishName,
      stepIndex: context.stepIndex,
    }).then(() => {
      if (turn.current !== myTurn || Date.now() > mainUntil) return;
      const fresh = takeAiLine(tag, line.id);
      if (fresh) setText(fresh.text);
    });
  }, [clearTimers, show]);

  return (
    <span className="mascot">
      <button
        type="button"
        className="mascot-button"
        onClick={handleClick}
        aria-label="和知味咪说句话"
        title="点我聊两句"
      >
        <img className="hero-mascot" src="/app-icon.svg" alt="戴厨师帽的知味咪小猫" />
      </button>
      {visible ? (
        <span className="mascot-bubble" role="status" aria-live="polite">
          {text}
        </span>
      ) : null}
    </span>
  );
}

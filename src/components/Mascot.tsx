/**
 * 首页的小猫形象：点一下会冒出一个说话气泡。
 *
 * - 首屏进入时说一句问候（同一会话只说一次）；
 * - 点击必换一句（轮换制，不连续重复）；
 * - 后台会向本地网关要几句新鲜话术，拿到就存进本地池，下次优先用；
 * - 断网 / 未配置 Key 时自动退化为纯语料，功能不受影响。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '../app/data';
import {
  lastLineId,
  pickLine,
  requestBanter,
  resolveTag,
  takeAiLine,
  takeGreeting,
} from '../services/mascotService';

/** 气泡停留时间：首屏问候久一点，点击短一点。 */
const GREET_HOLD_MS = 5200;
const CLICK_HOLD_MS = 4200;
/** 首屏问候延迟，避免和页面渲染抢注意力。 */
const GREET_DELAY_MS = 900;

export function Mascot() {
  const { data } = useData();
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  /** 每次点击自增，用于丢弃过期的 AI 替换结果 */
  const turn = useRef(0);

  const show = useCallback((value: string, holdMs: number) => {
    setText(value);
    setVisible(true);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), holdMs);
  }, []);

  // 卸载时清掉计时器，避免离开页面后仍在改状态
  useEffect(
    () => () => {
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  // 首屏问候 + 顺手预取几句 AI 话术
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const greeting = takeGreeting();
      if (greeting) show(greeting.text, GREET_HOLD_MS);
      void requestBanter('greet');
    }, GREET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  /** 有进行中的烹饪时，优先说「烹饪中」的话。 */
  const hasCooking = Boolean(data?.recipes.length) && false;

  const handleClick = useCallback(() => {
    const tag = resolveTag(new Date(), hasCooking);
    const line = pickLine({ tag, avoidId: lastLineId() });
    const myTurn = ++turn.current;
    show(line.text, CLICK_HOLD_MS);

    // 后台补充新鲜话术：若在气泡消失前拿到，直接替换成 AI 那句
    void requestBanter(tag).then(() => {
      // 用户已经点了下一次，就丢弃这次的结果
      if (turn.current !== myTurn) return;
      const fresh = takeAiLine(tag, line.id);
      if (fresh) setText(fresh.text);
    });
  }, [hasCooking, show]);

  return (
    <span className="mascot">
      <button
        type="button"
        className="mascot-button"
        onClick={handleClick}
        aria-label="和知味咪说句话"
        title="点我说两句"
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

import { useCallback, useEffect, useRef, useState } from 'react';

export function WelcomePortal({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  const enter = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(onEnter, 1320);
  }, [onEnter]);

  useEffect(() => {
    const enterFromKeyboard = (event: KeyboardEvent) => {
      if (event.repeat) return;
      enter();
    };
    window.addEventListener('keydown', enterFromKeyboard);
    return () => window.removeEventListener('keydown', enterFromKeyboard);
  }, [enter]);

  return (
    <section
      className={`welcome-portal is-paper${leaving ? ' is-leaving' : ''}`}
      aria-label="知味咪欢迎页"
    >
      <button
        type="button"
        className="welcome-canvas cover-canvas"
        onClick={enter}
        aria-label="点击封面任意位置或按任意键进入知味咪主页"
      >
        <span className="cover-tape cover-tape-a" aria-hidden="true" />
        <span className="cover-tape cover-tape-b" aria-hidden="true" />
        <span className="cover-frame" aria-hidden="true" />

        <span className="cover-top">
          <span className="cover-top-left">
            <span className="cover-kicker">A LETTER FROM ZHĪ WÈI MĪ · 2026</span>
            <span className="cover-issue">ISSUE 01 · DAILY KITCHEN</span>
          </span>
          <span className="cover-index" aria-hidden="true">
            01 — 08
          </span>
        </span>

        <span className="cover-main">
          <span className="cover-title-wrap">
            <span className="cover-outline" aria-hidden="true">
              ZHĪ WÈI MĪ
            </span>
            <span className="cover-title">知味咪</span>
          </span>
          <span className="cover-note">AI 个性化厨房</span>
          <span className="cover-subtitle">记住你的口味，定制每一餐</span>
        </span>

        <span className="cover-art" aria-hidden="true">
          <span className="cover-plate" />
          <img
            className="cover-cat"
            src="/mascot/motion-v3/01-greeting-spoon.webp?v=3"
            alt=""
            draggable={false}
          />
          <span className="cover-spark cover-spark-a">✦</span>
          <span className="cover-spark cover-spark-b">✦</span>
        </span>

        <span className="cover-foot" aria-hidden="true">
          <span>RECIPES · COOKING · MEMORIES</span>
          <span className="cover-hint">点击任意位置 · 或按任意键进入</span>
        </span>

        <span className="welcome-transition" aria-hidden="true">
          <span className="welcome-transition-paper" />
        </span>
      </button>
    </section>
  );
}

import { useState } from 'react';

export function WelcomePortal({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onEnter, 720);
  };

  return (
    <section className={`welcome-portal${leaving ? ' is-leaving' : ''}`} aria-label="知味咪欢迎页">
      <button type="button" className="welcome-canvas" onClick={enter} aria-label="点击进入知味咪主页">
        <span className="welcome-kicker">A DAILY KITCHEN NOTEBOOK · 2026</span>
        <span className="welcome-outline" aria-hidden="true">ZHĪ WÈI MĪ</span>
        <span className="welcome-title">知味咪</span>
        <span className="welcome-subtitle">让每一餐，都有被认真记住的味道</span>
        <img
          className="welcome-cat"
          src="/mascot/motion-v3/01-greeting-spoon.webp?v=3"
          alt="挥勺欢迎你的知味咪小猫"
          draggable={false}
        />
        <span className="welcome-enter">
          <span>点击进入</span>
          <i aria-hidden="true">↗</i>
        </span>
        <span className="welcome-index" aria-hidden="true">01 — 08</span>
      </button>
    </section>
  );
}

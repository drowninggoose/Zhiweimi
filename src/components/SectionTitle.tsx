import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * 全站统一的区块标题：手绘圆章图标 + 高亮笔触 + 波浪下划线。
 * 让各页面的说明性大标题保持同一套视觉语言。
 */
export function SectionTitle({
  icon,
  children,
  className,
}: {
  icon: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`section-title${className ? ` ${className}` : ''}`}>
      <span className="section-title-icon" aria-hidden="true">
        <Icon name={icon} size={21} />
      </span>
      <span className="section-title-text">{children}</span>
    </h2>
  );
}

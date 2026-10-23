import type { ReactNode, SVGProps } from 'react';

type FoodKind =
  | 'egg'
  | 'meat'
  | 'seafood'
  | 'vegetable'
  | 'mushroom'
  | 'tofu'
  | 'dairy'
  | 'grain'
  | 'seasoning'
  | 'fruit'
  | 'other';

const paths: Record<FoodKind, ReactNode> = {
  egg: <><path d="M12 3.5c3.6 0 6.4 5 6.4 9.2A6.4 6.4 0 0 1 5.6 12.7C5.6 8.5 8.4 3.5 12 3.5z" /><path d="M9.2 12.5c0 2.2 1.2 3.7 3 4.2" /></>,
  meat: <><path d="M5 10.2c0-3.4 2.8-6.2 6.2-6.2 2.1 0 3.7.9 4.8 2.4l2.1-.7 1.2 2.2-1.6 1.7c.2.9.1 1.9-.3 2.8C16.5 15.5 14 18 10.8 18 7.6 18 5 15.4 5 12.2z" /><path d="M9 12.2h.01M13.4 10.8h.01" /></>,
  seafood: <><path d="M4 13.2c2.3-3.8 5.1-5.7 8.5-5.7 3.2 0 5.5 1.5 7.5 4.4-2 3.8-4.7 5.7-8.1 5.7-3.3 0-5.7-1.5-7.9-4.4z" /><path d="M16 8.5l3.2-2.2.4 3.2-3.4 1.6M7.2 12.8c.9-.7 2-.7 2.9 0" /></>,
  vegetable: <><path d="M12 20c-4.4 0-8-3.2-8-7.2C4 8.6 7.6 5 12 5s8 3.6 8 7.8C20 16.8 16.4 20 12 20z" /><path d="M12 5c0-1.7 1.2-3 3-3M12 9v11M8 12c1.2 0 2.2.5 3 1.4M16 11c-1.2.1-2.2.6-3 1.5" /></>,
  mushroom: <><path d="M4 11.5C4 7.6 7.6 4.5 12 4.5s8 3.1 8 7c0 1.7-1.3 2.7-3.1 2.7H7.1C5.3 14.2 4 13.2 4 11.5z" /><path d="M9 14.4v3.2c0 1.3.9 2.4 2.1 2.4h1.8c1.2 0 2.1-1.1 2.1-2.4v-3.2M9 8.2h.01M14.4 9.4h.01" /></>,
  tofu: <><path d="M4.5 7.2L12 4l7.5 3.2v9.6L12 20l-7.5-3.2z" /><path d="M4.5 7.2L12 10.4l7.5-3.2M12 10.4V20" /></>,
  dairy: <><path d="M8 3.5h8l1.5 4v13H6.5v-13z" /><path d="M6.5 9.5h11M9.5 3.5v6" /></>,
  grain: <><path d="M12 20V8M12 10c-2.8 0-5-2.2-5-5 2.8 0 5 2.2 5 5zM12 13c2.8 0 5-2.2 5-5-2.8 0-5 2.2-5 5zM12 17c-2.8 0-5-2.2-5-5 2.8 0 5 2.2 5 5z" /></>,
  seasoning: <><path d="M8 8h8l1 12H7zM9 8V4h6v4M10 12h.01M14 12h.01M10 16h.01M14 16h.01" /></>,
  fruit: <><path d="M12 8c-3.5 0-5.8 2.6-5.8 6.2C6.2 17.8 8.5 20 12 20s5.8-2.2 5.8-5.8C17.8 10.6 15.5 8 12 8z" /><path d="M12 8c0-2 1.3-3.4 3.2-3.8M12 5.2c-1.2-1-2.6-1.2-4-.6" /></>,
  other: <><path d="M4 10h16l-1.3 7.5H5.3z" /><path d="M8 10l1.4-5h5.2L16 10M9 13.5h.01M15 13.5h.01" /></>,
};

function foodKindFor(name: string): FoodKind {
  const n = name.trim();
  if (/蛋|鹌鹑蛋|皮蛋/.test(n)) return 'egg';
  if (/豆腐|豆干|腐竹|豆皮|千张|素鸡/.test(n)) return 'tofu';
  if (/菇|菌|木耳|银耳|香菇|口蘑/.test(n)) return 'mushroom';
  if (/鱼|虾|蟹|贝|蛤|鱿|海参|牡蛎|蛏/.test(n)) return 'seafood';
  if (/猪|牛|羊|鸡|鸭|鹅|肉|排骨|培根|香肠|火腿|腊肠/.test(n)) return 'meat';
  if (/奶|芝士|黄油|酸奶|淡奶油|炼乳/.test(n)) return 'dairy';
  if (/米|面|粉|饭|年糕|馒头|面包|燕麦|吐司|意面/.test(n)) return 'grain';
  if (/盐|糖|酱|醋|油|料酒|胡椒|花椒|辣椒|香料|蚝油|味精|鸡精/.test(n)) return 'seasoning';
  if (/苹果|梨|橙|柠檬|莓|香蕉|葡萄|桃|杏|果|柚|芒果|菠萝/.test(n)) return 'fruit';
  if (/菜|瓜|茄|椒|萝卜|番茄|土豆|藕|笋|芹|菠菜|生菜|洋葱|葱|姜|蒜|玉米|山药|南瓜|西兰花/.test(n)) return 'vegetable';
  return 'other';
}

export function FoodIcon({ name, size = 40, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  const kind = foodKindFor(name);
  return (
    <span className={`food-icon food-icon-${kind}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths[kind]}
      </svg>
    </span>
  );
}

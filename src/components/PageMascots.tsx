type MascotPlacement = {
  src: string;
  label: string;
};

const mascot = (file: string, label: string): MascotPlacement => ({
  src: `/mascot/motion-v3/${file}.webp?v=3`,
  label,
});

function mascotsFor(pathname: string): MascotPlacement[] {
  if (pathname === '/') return [mascot('09-delicious-success', '享用美食的知味咪')];
  if (pathname.startsWith('/recipes')) {
    return [
      mascot('03-recipe-peek', '查看菜谱的知味咪'),
      mascot('04-recipe-search', '寻找菜谱的知味咪'),
    ];
  }
  if (pathname.startsWith('/planner/pantry')) {
    return [mascot('05-ingredient-basket', '整理食材的知味咪')];
  }
  if (pathname.startsWith('/planner')) {
    return [mascot('11-meal-planner', '制定饮食计划的知味咪')];
  }
  if (pathname.startsWith('/utensils')) {
    return [mascot('06-frying-pan', '准备厨具的知味咪')];
  }
  if (pathname.includes('/steps')) {
    return [
      mascot('08-stirring-soup', '专心烹饪的知味咪'),
      mascot('09-delicious-success', '完成料理的知味咪'),
    ];
  }
  if (/^\/cook\/[^/]+/.test(pathname)) {
    return [mascot('07-kitchen-timer', '准备计时的知味咪')];
  }
  if (pathname.startsWith('/cook')) {
    return [mascot('06-frying-pan', '准备下厨的知味咪')];
  }
  if (pathname.startsWith('/diary')) {
    return [mascot('10-food-diary-camera', '记录美食的知味咪')];
  }
  if (pathname.startsWith('/settings')) {
    return [mascot('12-data-settings', '管理数据的知味咪')];
  }
  return [];
}

export function PageMascots({ pathname }: { pathname: string }) {
  const items = mascotsFor(pathname);
  if (!items.length) return null;

  return (
    <div className="context-mascots" aria-hidden="true">
      {items.map((item, index) => (
        <img
          key={item.src}
          className={`context-mascot context-mascot-${index + 1}`}
          src={item.src}
          alt=""
          title={item.label}
          draggable={false}
        />
      ))}
    </div>
  );
}

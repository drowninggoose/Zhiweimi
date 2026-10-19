/**
 * 语音助手的「抢救方案」。
 *
 * 用户在烹饪中说「菜太咸了怎么办」时，助手不仅要给建议，还要把**后续步骤改写掉**：
 * 插入一步立即处理，并把后面的步骤按新的状态调整（例如已经加了水，就要改成收汁）。
 *
 * 这里只做纯数据变换，便于单元测试；真正的模型调用在网关 `/api/voice/chat`。
 */
import type { RecipeStep } from '../types/models';

/** 抢救方案里的一条动作（与对话回答的 actions 同构）。 */
export type RescueAction = { do: string; amount: string; when: string; check: string };

/** 一步「改写后的步骤」。order 由合并逻辑重新编号，这里只表达内容。 */
export type RescueStepPatch = {
  instruction: string;
  /** 结构化动作，如 加入、收汁、翻动 */
  action?: string;
  heat?: string;
  /** 只在原步骤已有该数值时沿用，模型不得编造 */
  durationSeconds?: number;
  check?: string;
  tip?: string;
};

export type RescuePlan = {
  /** 一句话说明为什么会这样、走哪条补救思路 */
  diagnosis: string;
  /** 立即处理的动作：做什么 / 多少 / 时机 / 怎么判断 */
  fixes: RescueAction[];
  /** 现在就插入执行的一步（例如「加半碗热水稀释」） */
  insertNow?: RescueStepPatch;
  /** 改写后的后续步骤（对应当前步骤之后的那些） */
  remaining?: RescueStepPatch[];
};

/** 菜品类型：不同形态的菜有不同补救手段。 */
export type DishKind =
  | '汤菜'
  | '炒／烧类热菜'
  | '炖／焖菜'
  | '蒸菜'
  | '凉菜'
  | '主食面食'
  | '甜品烘焙'
  | '西餐'
  | '小吃'
  | '家常菜';

/** 从菜谱信息推断菜品形态，供模型选择补救思路。 */
export function dishKindOf(recipe: {
  name?: string;
  cuisines?: string[];
  ingredients?: { name: string; amount?: string | number }[];
}): DishKind {
  const cuisines = (recipe.cuisines ?? []).join(' ');
  const name = recipe.name ?? '';
  // 汤汁比例高的菜，可以「加水稀释 / 加料吸味」，和干炒菜完全不同
  if (/汤羹|粥|汤锅|番茄汤|炖汤/.test(cuisines) || /汤|羹/.test(name)) return '汤菜';
  if (/凉菜/.test(cuisines) || /凉拌|拌/.test(name)) return '凉菜';
  if (/西餐/.test(cuisines)) return '西餐';
  if (/甜品|烘焙/.test(cuisines)) return '甜品烘焙';
  if (/主食|面食/.test(cuisines) || /饭|面|饺|包子/.test(name)) return '主食面食';
  if (/小吃/.test(cuisines)) return '小吃';
  if (/蒸/.test(name) || /蒸/.test(cuisines)) return '蒸菜';
  if (/炖|焖|煲/.test(name) || /炖|焖/.test(cuisines)) return '炖／焖菜';
  if (/热菜/.test(cuisines) || /炒|爆|溜|烧/.test(name)) return '炒／烧类热菜';
  return '家常菜';
}

/** 合并结果统计，用于界面提示「已更新后续 N 步」。 */
export type MergeResult = {
  steps: RecipeStep[];
  /** 插入了几步 */
  inserted: number;
  /** 替换了几步后续步骤 */
  replaced: number;
};

const RESCUE_PREFIX = 'rescue';

/**
 * 把抢救方案合并进步骤列表。
 *
 * - `currentIndex` 及之前的步骤**保持原样**（已经做过的不能改）；
 * - 若有 `insertNow`，紧跟当前步骤插入一条，并标记为抢救步骤；
 * - 若给了 `remaining`，用它替换「当前步骤之后」的全部步骤；否则保留原后续步骤；
 * - 所有步骤重新从 1 编号，避免 UI 显示错乱。
 */
export function mergeRescueSteps(
  steps: RecipeStep[],
  currentIndex: number,
  plan: RescuePlan,
  makeId: () => string,
): MergeResult {
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(steps.length - 1, 0));
  const head = steps.slice(0, safeIndex + 1).map((step) => ({ ...step }));
  const originalTail = steps.slice(safeIndex + 1);

  const insertedSteps: RecipeStep[] = [];
  if (plan.insertNow && plan.insertNow.instruction.trim()) {
    const patch = plan.insertNow;
    insertedSteps.push({
      id: `${RESCUE_PREFIX}-${makeId()}`,
      order: 0,
      instruction: patch.instruction,
      action: patch.action ?? '抢救',
      heat: patch.heat,
      durationSeconds: patch.durationSeconds,
      check: patch.check,
      tip: patch.tip ?? '这是抢救步骤，做完再继续原流程。',
    });
  }

  const remainingPatches = (plan.remaining ?? []).filter((item) => item.instruction?.trim());
  const tailSteps: RecipeStep[] =
    remainingPatches.length > 0
      ? remainingPatches.map((patch) => ({
          id: `${RESCUE_PREFIX}-${makeId()}`,
          order: 0,
          instruction: patch.instruction,
          action: patch.action,
          heat: patch.heat,
          durationSeconds: patch.durationSeconds,
          check: patch.check,
          tip: patch.tip,
        }))
      : originalTail.map((step) => ({ ...step }));

  const merged = [...head, ...insertedSteps, ...tailSteps].map((step, index) => ({
    ...step,
    order: index + 1,
  }));

  return {
    steps: merged,
    inserted: insertedSteps.length,
    replaced: remainingPatches.length > 0 ? remainingPatches.length : 0,
  };
}

/** 判断一条回答是否需要触发步骤改写。 */
export function shouldApplyRescue(plan: RescuePlan | null | undefined): plan is RescuePlan {
  if (!plan) return false;
  const hasInsert = Boolean(plan.insertNow?.instruction?.trim());
  const hasRemaining = (plan.remaining ?? []).some((item) => item.instruction?.trim());
  return hasInsert || hasRemaining;
}

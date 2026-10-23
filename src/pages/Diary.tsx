import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Image, ImageUpload } from '../components/common';
import { clearDiaryPick, readDiaryPick, writeDiaryPick } from '../components/diaryPick';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { StarRating } from '../components/StarRating';
import { useUnsaved } from '../hooks/useUnsaved';
import { diaryRows, validateDiary } from '../services/diaryService';
import { stamp, today, meals, mealLabels, type DiaryEntry, type MealType } from '../types/models';
export function DiaryPage() {
  const { data, run } = useData();
  const [params] = useSearchParams();
  const linked = data?.diaryEntries.find((e) => e.id === params.get('entry'));
  const [entry, setEntry] = useState<DiaryEntry | null>(linked ?? null);
  const [view, setView] = useState(!!linked);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const returningFromPick = params.get('pickReturn') === '1';
  const permitLeave = useUnsaved(dirty);
  // 从「全部菜谱」挑完关联菜谱回来：恢复离开前的日记草稿，并带上选中的菜谱。
  useEffect(() => {
    if (!returningFromPick) return;
    const draft = readDiaryPick();
    if (!draft) return;
    const recipeId = draft.recipeId ?? draft.entry.recipeId;
    // 等菜谱数据加载后再决定能不能补菜名。
    if (recipeId && !data) return;
    const picked = recipeId ? data?.recipes.find((recipe) => recipe.id === recipeId) : undefined;
    const next = { ...draft.entry, recipeId };
    if (!next.dishName.trim() && picked) next.dishName = picked.name;
    setEntry(next);
    setView(false);
    setDirty(true);
    clearDiaryPick();
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [returningFromPick, data]);
  /** 当前视图只展示今天的三餐。 */
  const rows = data ? diaryRows(data.diaryEntries, today(), today()) : [];
  if (!data) return null;
  const linkedRecipe = entry?.recipeId
    ? data.recipes.find((recipe) => recipe.id === entry.recipeId)
    : undefined;
  const linkedRecipeName = linkedRecipe?.name ?? (entry?.recipeId ? '重新选择菜谱' : '选择菜谱');
  function rememberDraft() {
    if (entry) writeDiaryPick({ entry });
    // 草稿已经暂存，去挑菜谱属于预期离开，不再弹「未保存」确认。
    permitLeave();
  }
  function open(date: string, mealType: MealType, existing?: DiaryEntry) {
    setEntry(existing ?? { ...stamp(), date, mealType, dishName: '' });
    setView(!!existing);
    setDirty(false);
    setError('');
  }
  function update(next: Partial<DiaryEntry>) {
    if (entry) {
      setEntry({ ...entry, ...next });
      setDirty(true);
    }
  }
  async function save() {
    if (!entry) return;
    const picked = entry.recipeId
      ? data!.recipes.find((recipe) => recipe.id === entry.recipeId)
      : undefined;
    const next = { ...entry, dishName: entry.dishName.trim() || picked?.name || '' };
    if (next.dishName !== entry.dishName) setEntry(next);
    try {
      validateDiary(next);
      const existing = data!.diaryEntries.find(
        (e) => e.date === next.date && e.mealType === next.mealType && e.id !== next.id,
      );
      if (existing && !confirm('同一天同一餐已有记录，替换原记录？')) return;
      if (await run(() => repositories.diaryEntries.save(next, !!existing))) {
        setEntry(null);
        setDirty(false);
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <div className="row between diary-head">
        <SectionTitle icon="camera">每一餐，都值得记住</SectionTitle>
        <button onClick={() => open(today(), 'dinner')}>添加记录</button>
      </div>
      {entry && (
        <section className="card fields">
          <div className="row between">
            <h2>{view ? '日记详情' : '编辑美食日记'}</h2>
            <button
              className="secondary"
              onClick={() => {
                if (!dirty || confirm('放弃未保存的日记修改？')) {
                  setEntry(null);
                  setDirty(false);
                }
              }}
            >
              关闭
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {view ? (
            <>
              <Image
                image={entry.image}
                url={entry.imageUrl}
                alt={entry.dishName}
                className="plate"
              />
              <h3>{entry.dishName}</h3>
              <p>
                {entry.date} · {mealLabels[entry.mealType]} · {entry.tasteRating}
              </p>
              <p>{entry.notes}</p>
              <p>{entry.adjustmentNotes}</p>
              <div className="row">
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label="编辑日记"
                  title="编辑日记"
                  onClick={() => setView(false)}
                >
                  <Icon name="pencil" />
                </button>
                {entry.recipeId && data.recipes.some((r) => r.id === entry.recipeId) && (
                  <Link
                    className="button icon-text-button"
                    to={`/cook/${entry.recipeId}`}
                    aria-label="再次烹饪"
                    title="再次烹饪"
                  >
                    <Icon name="flame" />
                    <span>再做一次</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="danger icon-button"
                  aria-label="删除日记"
                  title="删除日记"
                  onClick={async () => {
                    if (
                      confirm('确认删除这条日记？') &&
                      (await run(() => repositories.diaryEntries.delete(entry.id), '日记已删除'))
                    )
                      setEntry(null);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="row diary-meta-row">
                <label>
                  日期
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => update({ date: e.target.value })}
                  />
                </label>
                <label>
                  餐次
                  <select
                    value={entry.mealType}
                    onChange={(e) => update({ mealType: e.target.value as MealType })}
                  >
                    {meals.map((m) => (
                      <option key={m} value={m}>
                        {mealLabels[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="diary-recipe-field">
                  <span className="diary-recipe-caption">关联菜谱</span>
                  <div className="diary-recipe-row">
                    <Link
                      className="button secondary diary-recipe-button"
                      to="/recipes?pick=diary"
                      onClick={rememberDraft}
                      aria-label={`关联菜谱：${linkedRecipeName}`}
                      title="去菜谱总览选择关联菜谱"
                    >
                      <Icon name="book" size={18} />
                      <span className={`diary-recipe-name${linkedRecipe ? '' : ' is-empty'}`}>
                        {linkedRecipeName}
                      </span>
                    </Link>
                    {entry.recipeId && (
                      <button
                        type="button"
                        className="secondary icon-button diary-recipe-clear"
                        aria-label="取消关联菜谱"
                        title="取消关联菜谱"
                        onClick={() => update({ recipeId: undefined })}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label>
                菜名
                <input
                  value={entry.dishName}
                  onChange={(e) => update({ dishName: e.target.value })}
                />
              </label>
              <ImageUpload
                label="菜品照片"
                value={entry.image}
                onChange={(image) => update({ image })}
              />
              <StarRating
                value={entry.tasteRating}
                onChange={(rating) => update({ tasteRating: rating })}
              />
              <label>
                心得
                <textarea
                  value={entry.notes ?? ''}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </label>
              <label>
                实际用量调整与备注
                <textarea
                  value={entry.adjustmentNotes ?? ''}
                  onChange={(e) => update({ adjustmentNotes: e.target.value })}
                />
              </label>
              <button onClick={() => void save()}>保存日记</button>
            </>
          )}
        </section>
      )}
      {
        <section className="card">
          <div className="diary-row diary-heading">
            <span>日期</span>
            {meals.map((m) => (
              <strong key={m}>{mealLabels[m]}</strong>
            ))}
          </div>
          {rows.map((row) => (
            <div className="diary-row" key={row.date}>
              <strong>{row.date}</strong>
              {row.slots.map(({ meal, entry: record }) => (
                <button
                  key={meal}
                  className="diary-slot"
                  aria-label={`${row.date}${mealLabels[meal]}${record ? '查看' + record.dishName : '添加记录'}`}
                  onClick={() => open(row.date, meal, record)}
                >
                  <Image
                    image={record?.image}
                    url={record?.imageUrl}
                    alt={record?.dishName ?? '空盘子'}
                    className="plate"
                  />
                  <span>{record?.dishName ?? '添加记录'}</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      }
    </>
  );
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Image, ImageUpload } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { diaryRows, validateDiary } from '../services/diaryService';
import { useConfirm } from '../components/dialogContext';
import { stamp, today, meals, mealLabels, type DiaryEntry, type MealType } from '../types/models';
export function DiaryPage() {
  const { data, run } = useData();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const linked = data?.diaryEntries.find((e) => e.id === params.get('entry'));
  /** day = 只看某一天（默认今天）；all = 全部记录 */
  const [mode, setMode] = useState<'day' | 'all'>('day');
  const [day, setDay] = useState(today());
  const [entry, setEntry] = useState<DiaryEntry | null>(linked ?? null);
  const [view, setView] = useState(!!linked);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  useUnsaved(dirty);
  /** 当前视图要展示的行：单日或全部 */
  const rows = data
    ? mode === 'day'
      ? diaryRows(data.diaryEntries, day, day)
      : diaryRows(data.diaryEntries)
    : [];
  if (!data) return null;
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
    try {
      validateDiary(entry);
      const existing = data!.diaryEntries.find(
        (e) => e.date === entry.date && e.mealType === entry.mealType && e.id !== entry.id,
      );
      if (existing) {
        const replace = await confirm({
          title: '替换这条日记？',
          message: '同一天同一餐已有记录，保存后会覆盖原来那条。',
          confirmText: '替换',
          danger: true,
        });
        if (!replace) return;
      }
      if (await run(() => repositories.diaryEntries.save(entry, !!existing))) {
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
      <div className="row between">
        <h2>每一餐，都值得记住</h2>
        <button onClick={() => open(today(), 'dinner')}>添加记录</button>
      </div>
      <section className="card row">
        <label>
          查看日期
          <input
            type="date"
            value={day}
            disabled={mode === 'all'}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={mode === 'day' ? 'secondary' : ''}
          aria-pressed={mode === 'all'}
          onClick={() => setMode(mode === 'all' ? 'day' : 'all')}
        >
          全部记录
        </button>
      </section>
      {entry && (
        <section className="card fields">
          <div className="row between">
            <h2>{view ? '日记详情' : '编辑美食日记'}</h2>
            <button
              className="secondary"
              onClick={() => {
                void (async () => {
                  const ok =
                    !dirty ||
                    (await confirm({
                      title: '放弃未保存的修改？',
                      message: '这次编辑的内容不会保存。',
                      confirmText: '放弃修改',
                      danger: true,
                    }));
                  if (ok) {
                    setEntry(null);
                    setDirty(false);
                  }
                })();
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
              <Image image={entry.image} alt={entry.dishName} className="plate" />
              <h3>{entry.dishName}</h3>
              <p>
                {entry.date} · {mealLabels[entry.mealType]} · {entry.tasteRating}
              </p>
              <p>{entry.notes}</p>
              <p>{entry.adjustmentNotes}</p>
              <div className="row">
                <button onClick={() => setView(false)}>编辑日记</button>
                {entry.recipeId && data.recipes.some((r) => r.id === entry.recipeId) && (
                  <Link className="button" to={`/cook/${entry.recipeId}`}>
                    再次烹饪
                  </Link>
                )}
                <button
                  className="danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除这条日记？',
                      message: '删除后无法自动撤销。',
                      confirmText: '删除',
                      danger: true,
                    });
                    if (
                      ok &&
                      (await run(() => repositories.diaryEntries.delete(entry.id), '日记已删除'))
                    )
                      setEntry(null);
                  }}
                >
                  删除日记
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="row">
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
              <label>
                关联菜谱
                <select
                  value={entry.recipeId ?? ''}
                  onChange={(e) => update({ recipeId: e.target.value || undefined })}
                >
                  <option value="">无关联菜谱</option>
                  {data.recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                味道评价
                <input
                  value={entry.tasteRating ?? ''}
                  onChange={(e) => update({ tasteRating: e.target.value })}
                />
              </label>
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
      {(
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
                    alt={record?.dishName ?? '空盘子'}
                    className="plate"
                  />
                  <span>{record?.dishName ?? '添加记录'}</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

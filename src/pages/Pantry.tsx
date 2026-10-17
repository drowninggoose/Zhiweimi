import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { validatePantry } from '../services/planningService';
import { stamp, type PantryItem } from '../types/models';
const blank = (): PantryItem => ({ ...stamp(), name: '', category: '蔬菜', status: 'available' });
export function PantryPage() {
  const { data, run } = useData();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<PantryItem | null>(() =>
    params.has('new') ? blank() : null,
  );
  const [showAll, setShowAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  useUnsaved(dirty);
  if (!data) return null;
  const items = data.pantryItems.filter((p) => showAll || p.status === 'available');
  function update(next: Partial<PantryItem>) {
    if (editing) {
      setEditing({ ...editing, ...next });
      setDirty(true);
    }
  }
  async function save() {
    if (!editing) return;
    try {
      validatePantry(editing);
      if (
        await run(() =>
          data!.pantryItems.some((p) => p.id === editing.id)
            ? repositories.pantryItems.update(editing)
            : repositories.pantryItems.create(editing),
        )
      ) {
        setEditing(null);
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
        <h2>家里有什么，就从这里开始</h2>
        <button onClick={() => setEditing(blank())}>添加食材</button>
      </div>
      <div className="card row">
        <Link to="/planner">返回饮食计划</Link>
        <label>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          显示已用完与不要了的食材
        </label>
        <Link
          className="button secondary"
          to={`/recipes?ingredients=${encodeURIComponent(
            data.pantryItems
              .filter((p) => p.status === 'available')
              .map((p) => p.name)
              .join(','),
          )}`}
        >
          按已有食材查菜谱
        </Link>
      </div>
      {editing && (
        <section className="card fields">
          <h2>食材记录</h2>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <label>
            食材名称
            <input value={editing.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label>
            类别
            <input
              value={editing.category}
              onChange={(e) => update({ category: e.target.value })}
            />
          </label>
          <label>
            数量
            <input
              type="number"
              value={editing.quantity ?? ''}
              onChange={(e) =>
                update({ quantity: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </label>
          <label>
            单位
            <input value={editing.unit ?? ''} onChange={(e) => update({ unit: e.target.value })} />
          </label>
          <div className="row">
            <button onClick={() => void save()}>保存食材</button>
            <button
              className="secondary"
              onClick={() => {
                if (!dirty || confirm('放弃未保存修改？')) {
                  setEditing(null);
                  setDirty(false);
                }
              }}
            >
              取消
            </button>
          </div>
        </section>
      )}
      {items.length ? (
        <div className="grid">
          {items.map((p) => (
            <article className="card" key={p.id}>
              <h3>{p.name}</h3>
              <p>
                {p.category} · {p.quantity} {p.unit} ·{' '}
                {{ available: '现有', 'used-up': '已用完', discarded: '不要了' }[p.status]}
              </p>
              <div className="row">
                <button className="secondary" onClick={() => setEditing(p)}>
                  编辑
                </button>
                {p.status === 'available' ? (
                  <>
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(
                          () => repositories.pantryItems.update({ ...p, status: 'used-up' }),
                          '已标记为用完',
                        )
                      }
                    >
                      已用完
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(
                          () => repositories.pantryItems.update({ ...p, status: 'discarded' }),
                          '已标记为不要了',
                        )
                      }
                    >
                      不要了
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      void run(
                        () => repositories.pantryItems.update({ ...p, status: 'available' }),
                        '恢复为现有食材',
                      )
                    }
                  >
                    恢复现有
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>还没有现有食材，添加新买的食材以便安排饮食。</Empty>
      )}
    </>
  );
}

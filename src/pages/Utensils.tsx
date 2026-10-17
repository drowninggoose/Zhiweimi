import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload } from '../components/common';
import { useUnsaved } from '../hooks/useUnsaved';
import { stamp, type Utensil } from '../types/models';
import { utensilTypes, validateUtensil } from '../services/utensilService';
import { analyzeUtensil } from '../services/aiService';
/**
 * 新建厨具的初始值：名称与容量都留空。
 * 容量用 0 表示「尚未填写」，输入框会显示为空，保存时由 validateUtensil 拦截。
 */
const blank = (): Utensil => ({
  ...stamp(),
  name: '',
  type: 'cup',
  capacity: 0,
  capacityUnit: 'ml',
});
export function UtensilsPage() {
  const { data, run } = useData();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<Utensil | null>(() =>
    params.has('new') ? blank() : null,
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  useUnsaved(dirty);
  async function save() {
    if (!editing) return;
    try {
      validateUtensil(editing);
      if (
        await run(() =>
          data?.utensils.some((u) => u.id === editing.id)
            ? repositories.utensils.update(editing)
            : repositories.utensils.create(editing),
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
  function update(next: Partial<Utensil>) {
    if (editing) {
      setEditing({ ...editing, ...next });
      setDirty(true);
    }
  }
  async function analyze() {
    if (!editing?.image) return setError('请先上传厨具照片');
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzeUtensil(editing.image);
      update({
        name: editing.name.trim() || result.name,
        type: result.type,
        capacity: Math.round(result.capacityMl),
        aiEstimate: {
          rangeMinMl: Math.round(result.rangeMinMl),
          rangeMaxMl: Math.round(result.rangeMaxMl),
          confidence: result.confidence,
          reasoning: result.reasoning,
          needsConfirmation: result.needsConfirmation,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }
  return (
    <>
      <div className="row between">
        <h2>熟悉的厨具，直观的用量</h2>
        <button
          onClick={() => {
            setEditing(blank());
            setDirty(false);
          }}
        >
          添加厨具
        </button>
      </div>
      {editing && (
        <section className="card fields">
          <h2>{data?.utensils.some((u) => u.id === editing.id) ? '编辑厨具' : '添加厨具'}</h2>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <label>
            厨具名称
            <input value={editing.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label>
            类型
            <select
              value={editing.type}
              onChange={(e) => update({ type: e.target.value as Utensil['type'] })}
            >
              {Object.entries(utensilTypes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            容量（ml）
            <input
              type="number"
              min={1}
              placeholder="请填写，例如 500"
              value={editing.capacity || ''}
              onChange={(e) => update({ capacity: Number(e.target.value) })}
            />
          </label>
          <ImageUpload
            label="厨具照片"
            value={editing.image}
            onChange={(image) => update({ image })}
          />
          <button
            className="secondary"
            disabled={!editing.image || analyzing}
            onClick={() => void analyze()}
          >
            {analyzing ? 'AI 正在估算…' : 'AI 识别并估算容量'}
          </button>
          {editing.aiEstimate && (
            <p className="muted">
              估算范围 {editing.aiEstimate.rangeMinMl}–{editing.aiEstimate.rangeMaxMl} ml · 置信度{' '}
              {Math.round(editing.aiEstimate.confidence * 100)}% · {editing.aiEstimate.reasoning}
              {editing.aiEstimate.needsConfirmation ? '（请务必手动确认）' : ''}
            </p>
          )}
          <div className="row">
            <button onClick={() => void save()}>保存厨具</button>
            <button
              className="secondary"
              onClick={() => {
                if (!dirty || confirm('放弃未保存的厨具修改？')) {
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
      {data?.utensils.length ? (
        <div className="grid">
          {data.utensils.map((u) => (
            <article className="card" key={u.id}>
              <Image image={u.image} alt={u.name} className="upload-preview" />
              <h3>{u.name}</h3>
              <p>
                {utensilTypes[u.type]} · {u.capacity} ml
              </p>
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(u);
                    setDirty(false);
                  }}
                >
                  编辑
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`确认删除厨具“${u.name}”？`))
                      void run(() => repositories.utensils.delete(u.id), '厨具已删除');
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>还没有家用厨具，点击“添加厨具”记录你的第一只杯子。</Empty>
      )}
    </>
  );
}

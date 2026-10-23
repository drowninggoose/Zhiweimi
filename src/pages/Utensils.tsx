import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { Empty, Image, ImageUpload } from '../components/common';
import { FoodIcon } from '../components/FoodIcon';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/SectionTitle';
import { useUnsaved } from '../hooks/useUnsaved';
import { stamp, type PantryItem, type Utensil } from '../types/models';
import { utensilTypes, validateUtensil } from '../services/utensilService';
import { analyzeUtensil } from '../services/aiService';
import { cleanIngredientName } from '../services/ingredientCleanup';
import { isSeasoningName } from '../services/ingredientGroups';

const blank = (): Utensil => ({
  ...stamp(),
  name: '',
  type: 'cup',
  capacity: 0,
  capacityUnit: 'ml',
});

function fridgeCategory(name: string) {
  if (/蛋/.test(name)) return '蛋类';
  if (/鱼|虾|蟹|贝|蛤|鱿/.test(name)) return '水产';
  if (/猪|牛|羊|鸡|鸭|肉|排骨|培根|香肠/.test(name)) return '肉类';
  if (/奶|芝士|黄油|酸奶/.test(name)) return '乳制品';
  if (/豆腐|豆干|腐竹|豆皮/.test(name)) return '豆制品';
  if (/米|面|粉|饭|年糕|馒头|面包/.test(name)) return '主食';
  if (/盐|糖|酱|醋|油|料酒|胡椒|花椒/.test(name)) return '调味';
  if (/菜|瓜|茄|椒|萝卜|番茄|土豆|藕|笋|葱|姜|蒜/.test(name)) return '蔬菜';
  return '其他';
}

export function UtensilsPage() {
  const { data, run } = useData();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<Utensil | null>(() =>
    params.has('new') ? blank() : null,
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [fridgeName, setFridgeName] = useState('');
  const [fridgeError, setFridgeError] = useState('');
  const [fridgeAdding, setFridgeAdding] = useState(false);
  useUnsaved(dirty);

  const fridgeItems = [...(data?.pantryItems ?? [])]
    .filter((item) => {
      const name = cleanIngredientName(item.name);
      if (!name) return false;
      return !isSeasoningName(name);
    })
    .sort((a, b) => {
      const have = Number(b.status === 'available') - Number(a.status === 'available');
      return have || a.name.localeCompare(b.name, 'zh');
    });
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

  async function addFridgeItem(e: FormEvent) {
    e.preventDefault();
    const name = cleanIngredientName(fridgeName);
    if (!name) return;
    if (isSeasoningName(name)) {
      setFridgeError('调味料默认齐备，不用放进冰箱。');
      return;
    }
    setFridgeError('');
    const existing = fridgeItems.find((item) => item.name === name);
    if (existing) {
      if (existing.status !== 'available') {
        await run(() => repositories.pantryItems.update({ ...existing, status: 'available' }), '');
      }
    } else {
      const item: PantryItem = {
        ...stamp(),
        name,
        category: fridgeCategory(name),
        quantity: 0,
        unit: '',
        status: 'available',
      };
      await run(() => repositories.pantryItems.create(item), '');
    }
    setFridgeName('');
    setFridgeAdding(false);
  }

  function closeFridgeAdd() {
    setFridgeAdding(false);
    setFridgeName('');
    setFridgeError('');
  }

  async function toggleFridgeItem(item: PantryItem) {
    await run(
      () =>
        repositories.pantryItems.update({
          ...item,
          status: item.status === 'available' ? 'used-up' : 'available',
        }),
      '',
    );
  }

  async function removeFridgeItem(item: PantryItem) {
    if (!confirm(`从冰箱移除“${item.name}”？`)) return;
    await run(() => repositories.pantryItems.delete(item.id), '');
  }

  return (
    <>
      <div className="kitchen-sections">
        <section className="kitchen-block kitchen-block-utensils">
          <div className="kitchen-block-head">
            <div>
              <span className="section-kicker">MY UTENSILS</span>
              <SectionTitle icon="pot">我的厨具</SectionTitle>
            </div>
            <button
              type="button"
              className="icon-text-button"
              onClick={() => {
                setEditing(blank());
                setDirty(false);
              }}
            >
              <Icon name="plus" />
              <span>添加厨具</span>
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
                  估算范围 {editing.aiEstimate.rangeMinMl}–{editing.aiEstimate.rangeMaxMl} ml ·
                  置信度 {Math.round(editing.aiEstimate.confidence * 100)}% ·{' '}
                  {editing.aiEstimate.reasoning}
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
                      type="button"
                      className="secondary icon-button"
                      aria-label="编辑"
                      title="编辑"
                      onClick={() => {
                        setEditing(u);
                        setDirty(false);
                      }}
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      className="danger icon-button"
                      aria-label="删除"
                      title="删除"
                      onClick={() => {
                        if (confirm(`确认删除厨具“${u.name}”？`))
                          void run(() => repositories.utensils.delete(u.id), '');
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty>还没有厨具，点击“添加厨具”记录你的第一只杯子。</Empty>
          )}
        </section>

        <section className="kitchen-block kitchen-block-fridge">
          <div className="kitchen-block-head">
            <div>
              <span className="section-kicker">MY FRIDGE</span>
              <SectionTitle icon="fridge">
                <span id="my-fridge">我的冰箱</span>
              </SectionTitle>
            </div>
            {!fridgeAdding && (
              <button
                type="button"
                className="icon-text-button"
                onClick={() => setFridgeAdding(true)}
              >
                <Icon name="plus" />
                <span>添加食材</span>
              </button>
            )}
          </div>

          {fridgeAdding && (
            <>
              <form className="fridge-add" onSubmit={(e) => void addFridgeItem(e)}>
                <input
                  autoFocus
                  aria-label="新食材名称"
                  placeholder="输入食材，例如：鸡蛋、番茄、猪肉"
                  value={fridgeName}
                  onChange={(e) => {
                    setFridgeName(e.target.value);
                    if (fridgeError) setFridgeError('');
                  }}
                />
                <button type="submit" className="icon-text-button">
                  <Icon name="plus" />
                  <span>放进冰箱</span>
                </button>
                <button type="button" className="secondary" onClick={closeFridgeAdd}>
                  取消
                </button>
              </form>
              {fridgeError && (
                <p className="fridge-error" role="status">
                  {fridgeError}
                </p>
              )}
            </>
          )}

          {fridgeItems.length ? (
            <div className="fridge-list">
              {fridgeItems.map((item) => {
                const have = item.status === 'available';
                return (
                  <div className={`fridge-row${have ? ' has' : ''}`} key={item.id}>
                    <button
                      type="button"
                      className="fridge-toggle"
                      aria-pressed={have}
                      aria-label={`${item.name}${have ? '有' : '没有'}，点一下切换`}
                      onClick={() => void toggleFridgeItem(item)}
                    >
                      <span className="fridge-check" aria-hidden="true">
                        {have ? <Icon name="check" size={15} /> : null}
                      </span>
                    </button>
                    <Link
                      className="fridge-link"
                      to={`/recipes?q=${encodeURIComponent(item.name)}`}
                      title={`搜索使用${item.name}的菜谱`}
                    >
                      <FoodIcon name={item.name} size={38} />
                      <span className="fridge-name">{item.name}</span>
                    </Link>
                    <button
                      type="button"
                      className="fridge-state"
                      aria-pressed={have}
                      onClick={() => void toggleFridgeItem(item)}
                    >
                      {have ? '有' : '没有'}
                    </button>
                    <button
                      type="button"
                      className="secondary icon-button fridge-remove"
                      aria-label={`移除${item.name}`}
                      title="从冰箱移除"
                      onClick={() => void removeFridgeItem(item)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="fridge-empty">冰箱还是空的。把常吃的食材放进来，做饭时就能自动打钩。</p>
          )}
        </section>
      </div>
    </>
  );
}

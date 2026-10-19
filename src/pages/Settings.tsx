import { useState } from 'react';
import { useData } from '../app/data';
import { repositories } from '../db/repositories';
import { exportBackup, parseBackup, downloadBackup } from '../services/backupService';
import { today, type Preferences } from '../types/models';
export function SettingsPage() {
  const { data, run } = useData();
  const [preferences, setPreferences] = useState<Preferences>(() => data!.preferences);
  const [error, setError] = useState('');
  const counts = data
    ? {
        recipes: data.recipes.filter((r) => r.sourceType === 'user').length,
        utensils: data.utensils.length,
        diaryEntries: data.diaryEntries.length,
        mealPlans: data.mealPlans.length,
        pantryItems: data.pantryItems.length,
      }
    : null;
  const labels = {
    recipes: '用户菜谱',
    utensils: '厨具',
    diaryEntries: '美食日记',
    mealPlans: '饮食计划',
    pantryItems: '家庭食材',
  };
  if (!data || !counts) return null;
  async function imported(file: File) {
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('备份文件不能超过100 MB');
      const snapshot = parseBackup(await file.text());
      setError('');
      if (
        confirm(
          `备份已完整校验：${snapshot.recipes.length}道菜谱、${snapshot.utensils.length}件厨具、${snapshot.diaryEntries.length}条日记。继续将覆盖全部现有数据（包含图片），确认恢复？`,
        )
      ) {
        if (await run(() => repositories.restore(snapshot), '备份恢复成功'))
          setPreferences(snapshot.preferences);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <section className="card">
        <h2>本地数据，一目了然</h2>
        <div className="grid">
          {Object.entries(counts).map(([key, count]) => (
            <div className="stat" key={key}>
              <strong>{count}</strong>
              <span>{labels[key as keyof typeof labels]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card fields">
        <h2>我的偏好</h2>
        <label>
          默认口味（逗号分隔）
          <input
            value={preferences.flavorPreferences.join(',')}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                flavorPreferences: e.target.value.split(/[,，]/),
              })
            }
          />
        </label>
        <label>
          忌口（逗号分隔）
          <input
            value={preferences.avoidIngredients.join(',')}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                avoidIngredients: e.target.value.split(/[,，]/),
              })
            }
          />
        </label>
        <label>
          默认难度
          <select
            aria-label="默认难度"
            value={preferences.defaultDifficulty ?? ''}
            onChange={(e) =>
              setPreferences({ ...preferences, defaultDifficulty: e.target.value || undefined })
            }
          >
            <option value="">不限</option>
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="advanced">进阶</option>
          </select>
        </label>
        <label>
          字体大小
          <select
            aria-label="字体大小"
            value={preferences.fontScale}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                fontScale: e.target.value as Preferences['fontScale'],
              })
            }
          >
            <option value="small">小</option>
            <option value="normal">标准</option>
            <option value="large">大</option>
          </select>
        </label>
        <button
          onClick={() =>
            void run(
              () =>
                repositories.preferences.update({
                  ...preferences,
                  flavorPreferences: preferences.flavorPreferences
                    .map((s) => s.trim())
                    .filter(Boolean),
                  avoidIngredients: preferences.avoidIngredients
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              '偏好已保存',
            )
          }
        >
          保存偏好
        </button>
      </section>
      <section className="card fields">
        <h2>备份与恢复</h2>
        <p>全部业务数据和上传图片包含在单一备份中。导入先完整校验，确认后覆盖写入；失败会回滚。</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          onClick={() =>
            void run(
              async () =>
                downloadBackup(await exportBackup(await repositories.snapshot()), today()),
              '备份已导出，现有数据保持不变',
            )
          }
        >
          导出全部数据
        </button>
        <label>
          导入备份
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void imported(file);
              e.target.value = '';
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            if (
              confirm(
                '重新导入完整菜谱库（517 道）？会覆盖菜谱库里的现有菜谱并清除最近查看记录；你的自建菜谱、日记、厨具、计划和食材都会保留。',
              )
            )
              void run(() => repositories.restoreLibrary(), '菜谱库已重新导入');
          }}
        >
          恢复菜谱库
        </button>
      </section>
      <section className="card">
        <h2>清空数据</h2>
        <p>请先导出备份。清空无法自动撤销，可通过备份恢复。</p>
        <div className="row">
          {Object.entries(labels).map(([key, label]) => (
            <button
              className="danger"
              key={key}
              onClick={() => {
                if (confirm(`确认清空${label}？`))
                  void run(() => repositories.clear(key), `${label}已清空`);
              }}
            >
              清空{label}
            </button>
          ))}
          <button
            className="danger"
            onClick={() => {
              if (
                confirm('确认清空全部本地数据（包括菜谱库、上传图片和偏好）？请先备份。')
              )
                void run(() => repositories.clear('all'), '全部数据已清空');
            }}
          >
            清空全部数据
          </button>
        </div>
      </section>
      <section className="card">
        <h2>关于知味咪</h2>
        <p>V0.1.0 · 数据版本 {data.preferences.dataVersion} · IndexedDB 本地保存</p>
        <p>
          安装依赖后通过本地服务运行，无账号、无云服务。请固定使用同一个浏览器和 localhost 地址。
        </p>
        <p>演示推荐、模拟换算、模拟建议与演示计划均由本地规则生成。</p>
      </section>
    </>
  );
}

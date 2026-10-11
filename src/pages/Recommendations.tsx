import { useState } from 'react';
import { useData } from '../app/data';
import { RecipeCard, Empty } from '../components/common';
import { recommendations } from '../services/planningService';
import { meals, mealLabels, type MealType } from '../types/models';
export function RecommendationsPage() {
  const { data } = useData();
  const [meal, setMeal] = useState<MealType>();
  const [batch, setBatch] = useState<string[]>([]);
  if (!data) return null;
  const conditions = {
    flavors: data.preferences.flavorPreferences,
    avoidIngredients: data.preferences.avoidIngredients,
    difficulty: data.preferences.defaultDifficulty,
    preferPantry: true,
  };
  const result = batch.length
    ? data.recipes.filter((r) => batch.includes(r.id))
    : recommendations(data.recipes, conditions, data.pantryItems, meal, [], () => 0.5);
  function change(nextMeal: MealType | undefined) {
    setMeal(nextMeal);
    const next = recommendations(
      data!.recipes,
      conditions,
      data!.pantryItems,
      nextMeal,
      result.map((r) => r.id),
    );
    setBatch(next.map((r) => r.id));
  }
  return (
    <>
      <div className="row between">
        <div>
          <h2>今天想吃点什么？</h2>
          <span className="tag">演示推荐</span>
        </div>
        <button onClick={() => change(meal)}>换一批</button>
      </div>
      <section className="card row">
        <button className={!meal ? '' : 'secondary'} onClick={() => change(undefined)}>
          全部
        </button>
        {meals.map((m) => (
          <button className={meal === m ? '' : 'secondary'} key={m} onClick={() => change(m)}>
            {mealLabels[m]}
          </button>
        ))}
      </section>
      {result.length ? (
        <div className="grid">
          {result.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      ) : (
        <Empty>没有符合偏好与忌口的菜谱，请到数据与设置调整条件。</Empty>
      )}
    </>
  );
}

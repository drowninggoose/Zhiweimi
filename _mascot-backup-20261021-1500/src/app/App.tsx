import {
  createBrowserRouter,
  RouterProvider,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useState } from 'react';
import { DataProvider } from './DataContext';
import { useData } from './data';
import { navigation } from './navigation';
import { RecipesPage, RecipeDetail, RecipeEditor } from '../pages/Recipes';
import { UtensilsPage } from '../pages/Utensils';
import { CookingSelect, CookingPrepare, CookingSteps } from '../pages/Cooking';
import { DiaryPage } from '../pages/Diary';
import { PantryPage } from '../pages/Pantry';
import { PlannerPage } from '../pages/Planner';
import { HomePage } from '../pages/Home';
import { SettingsPage } from '../pages/Settings';
import { VoiceAssistant } from '../components/VoiceAssistant';
import { AnimatedMascot } from '../components/Mascot';
function Shell() {
  const { data, error, notice } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const title =
    navigation.find(([path]) =>
      path === '/' ? location.pathname === '/' : location.pathname.startsWith(path),
    )?.[1] ?? '知味咪';
  const page = (path: string, label: string) =>
    path === '/settings' ? (
      <SettingsPage />
    ) : path === '/' ? (
      <HomePage />
    ) : path === '/planner' ? (
      <Routes>
        <Route index element={<PlannerPage />} />
        <Route path="pantry" element={<PantryPage />} />
      </Routes>
    ) : path === '/utensils' ? (
      <UtensilsPage />
    ) : path === '/diary' ? (
      <DiaryPage />
    ) : path === '/cook' ? (
      <Routes>
        <Route index element={<CookingSelect />} />
        <Route path=":recipeId" element={<CookingPrepare />} />
        <Route path=":recipeId/steps" element={<CookingSteps key={location.pathname} />} />
      </Routes>
    ) : (
      <section className="card">
        <h2>{label}</h2>
        <p>请选择左侧功能模块。</p>
        <NavLink to="/recipes">浏览菜谱</NavLink>
      </section>
    );
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <img className="brand-cat" src="/mascot-cat.png" alt="戴厨师帽、拿量勺的知味咪小猫" />
          <strong>知味咪</strong>
          <small>把每餐做成小幸福</small>
        </div>
        <nav>
          {navigation.map(([path, label], index) => (
            <NavLink key={path} to={path} end={path === '/'} aria-label={label}>
              <span className="nav-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="local-note">本地保存 · 离线可用</p>
      </aside>
      <section className="workspace">
        <header>
          <div className="page-title-with-mascot">
            <AnimatedMascot className="page-mascot" label={`${title}板块的知味咪`} />
            <div className="page-heading">
              <small>ZHĪ WÈI MĪ · DAILY KITCHEN</small>
              <h1>{title}</h1>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/recipes?q=${encodeURIComponent(query)}`);
            }}
          >
            <input
              aria-label="全局菜谱搜索"
              placeholder="搜索菜名或食材…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button>搜索</button>
          </form>
        </header>
        <main data-section={title}>
          <div className="page-stage">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="success">
                {notice}
              </p>
            )}
            {!data ? (
              <p>正在打开本地数据库…</p>
            ) : (
              <Routes>
                <Route path="/recipes" element={<RecipesPage key={location.search} />} />
                <Route path="/recipes/new" element={<RecipeEditor />} />
                <Route path="/recipes/:id" element={<RecipeDetail />} />
                <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
                {navigation
                  .filter(([path]) => path !== '/recipes')
                  .map(([path, label]) => (
                    <Route
                      key={path}
                      path={path === '/' ? '/' : `${path}/*`}
                      element={page(path, label)}
                    />
                  ))}
              </Routes>
            )}
          </div>
        </main>
      </section>
      <VoiceAssistant />
    </div>
  );
}
export function App() {
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <Shell /> }]));
  return (
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  );
}

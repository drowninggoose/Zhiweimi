import {
  createBrowserRouter,
  RouterProvider,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
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
import { Icon, type IconName } from '../components/Icon';
import { WelcomePortal } from '../components/WelcomePortal';
import {
  clearEnteredPortal,
  hasEnteredPortal,
  markEnteredPortal,
} from '../components/portalStorage';

function KitchenClock() {
  return (
    <div className="kitchen-loading" role="status" aria-live="polite">
      <div className="clock-loader" aria-hidden="true">
        <span className="clock-bell clock-bell-left" />
        <span className="clock-bell clock-bell-right" />
        <div className="clock-face">
          <span className="clock-hand clock-hour" />
          <span className="clock-hand clock-minute" />
          <span className="clock-center" />
        </div>
      </div>
      <p>正在翻开厨房…</p>
    </div>
  );
}

const isTestEnv =
  (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === 'test';

const NAV_ICONS: Record<string, IconName> = {
  '/': 'home',
  '/recipes': 'book',
  '/utensils': 'fridge',
  '/cook': 'flame',
  '/diary': 'camera',
  '/planner': 'calendar',
  '/settings': 'settings',
};

function Shell({ onShowPortal }: { onShowPortal: () => void }) {
  const { data, error } = useData();
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
          <img
            className="brand-cat"
            src="/mascot/set-01/01-greeting-spoon.gif?v=3"
            alt="挥勺问候的知味咪小猫"
          />
          <strong>知味咪</strong>
          <small>把每餐做成小幸福</small>
        </div>
        <nav>
          {navigation.map(([path, label]) => (
            <NavLink key={path} to={path} end={path === '/'} aria-label={label}>
              <span className="nav-icon" aria-hidden="true">
                <Icon name={NAV_ICONS[path] ?? 'book'} size={19} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="cover-return" onClick={onShowPortal}>
            <Icon name="arrow-right" size={14} />
            返回封面
          </button>
        </div>
      </aside>
      <section className="workspace" data-section={title}>
        <header>
          <div className="page-title-with-mascot">
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
            <button aria-label="搜索" title="搜索">
              <Icon name="search" />
            </button>
          </form>
        </header>
        <main data-section={title}>
          <div className="page-stage" key={`${location.pathname}${location.search}`}>
            <div className="page-content">
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {!data ? (
                <KitchenClock />
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
          </div>
        </main>
      </section>
      <VoiceAssistant />
    </div>
  );
}

function BootGate({ children }: { children: ReactNode }) {
  const { data } = useData();
  const [minElapsed, setMinElapsed] = useState(isTestEnv);

  useEffect(() => {
    if (minElapsed) return;
    const timer = window.setTimeout(() => setMinElapsed(true), 1000);
    return () => window.clearTimeout(timer);
  }, [minElapsed]);

  if (isTestEnv) return <>{children}</>;

  if (!data || !minElapsed)
    return (
      <div className="boot-screen">
        <KitchenClock />
      </div>
    );

  return (
    <>
      {children}
      <div className="enter-veil" aria-hidden="true" />
    </>
  );
}

function EnteredApp({ onShowPortal }: { onShowPortal: () => void }) {
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', element: <Shell onShowPortal={onShowPortal} /> }]),
  );
  return (
    <DataProvider>
      <BootGate>
        <RouterProvider router={router} />
      </BootGate>
    </DataProvider>
  );
}

export function App() {
  const [entered, setEntered] = useState(() => hasEnteredPortal());
  if (!entered) {
    return (
      <WelcomePortal
        onEnter={() => {
          markEnteredPortal();
          setEntered(true);
        }}
      />
    );
  }
  return (
    <EnteredApp
      onShowPortal={() => {
        clearEnteredPortal();
        setEntered(false);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }}
    />
  );
}

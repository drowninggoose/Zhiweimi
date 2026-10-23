import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Recipe, StoredImage } from '../types/models';
import { storeImage } from '../services/imageService';
import { repositories } from '../db/repositories';
import { useData } from '../app/data';
import { Icon } from './Icon';
export function Image({
  image,
  url,
  alt,
  className,
}: {
  image?: StoredImage;
  url?: string;
  alt: string;
  className?: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image.blob);
    if (imageRef.current) imageRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);
  return image || url ? (
    <img ref={imageRef} className={className} src={url} alt={alt} />
  ) : (
    <div className={`image-placeholder ${className ?? ''}`} aria-label={alt}>
      🍽️
    </div>
  );
}
export function ImageUpload({
  value,
  onChange,
  label = '图片',
}: {
  value?: StoredImage;
  onChange: (image?: StoredImage) => void;
  label?: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label>
        {label}
        <input
          type="file"
          aria-label={`上传${label}`}
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              onChange(await storeImage(file));
              setError('');
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </label>
      {value && (
        <>
          <Image image={value} alt={`${label}预览`} className="upload-preview" />
          <button type="button" className="secondary" onClick={() => onChange(undefined)}>
            删除{label}
          </button>
        </>
      )}
      {busy && <p>正在压缩图片…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { run } = useData();
  return (
    <article className="card recipe-card">
      <Link to={`/recipes/${recipe.id}`}>
        <Image image={recipe.coverImage} url={recipe.coverUrl} alt={recipe.name} />
      </Link>
      <div className="recipe-body">
        <h3>
          <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
        </h3>
        <div className="row">
          <span className="tag">{recipe.cuisines.join(' / ')}</span>
          <span className="muted">{recipe.estimatedMinutes ?? '—'} 分钟</span>
        </div>
        <div className="row recipe-card-actions">
          <button
            type="button"
            className={`secondary icon-button${recipe.favorite ? ' is-favorite' : ''}`}
            aria-label={`${recipe.favorite ? '取消收藏' : '收藏'}${recipe.name}`}
            title={recipe.favorite ? '取消收藏' : '收藏'}
            onClick={() => void run(() => repositories.recipes.favorite(recipe), '收藏已更新')}
          >
            <Icon name={recipe.favorite ? 'heart-filled' : 'heart'} />
          </button>
          {recipe.status === 'published' && (
            <Link
              className="button icon-text-button"
              to={`/cook/${recipe.id}`}
              aria-label={`开始烹饪${recipe.name}`}
              title="开始烹饪"
            >
              <Icon name="flame" />
              <span>开火</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
const EMPTY_MASCOTS: Array<{ test: RegExp; file: string; size: number }> = [
  { test: /^\/planner\/pantry/, file: '05-ingredient-basket', size: 148 },
  { test: /^\/planner/, file: '11-meal-planner', size: 158 },
  { test: /^\/utensils/, file: '06-frying-pan', size: 148 },
  { test: /^\/cook/, file: '07-kitchen-timer', size: 138 },
  { test: /^\/recipes/, file: '04-recipe-search', size: 136 },
  { test: /^\/diary/, file: '10-food-diary-camera', size: 142 },
  { test: /^\/settings/, file: '12-data-settings', size: 132 },
];

function emptyMascotFor(pathname: string) {
  return EMPTY_MASCOTS.find((item) => item.test.test(pathname)) ?? {
    file: '09-delicious-success',
    size: 136,
  };
}

export function Empty({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const mascot = emptyMascotFor(pathname);
  return (
    <section className="card empty empty-with-mascot">
      <p>{children}</p>
      <img
        className="empty-mascot"
        src={`/mascot/motion-v3/${mascot.file}.webp?v=3`}
        alt=""
        style={{ width: `${Math.round(mascot.size * 1.28)}px` }}
        draggable={false}
      />
    </section>
  );
}

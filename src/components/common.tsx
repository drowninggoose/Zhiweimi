import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Recipe, StoredImage } from '../types/models';
import { storeImage } from '../services/imageService';
import { repositories } from '../db/repositories';
import { useData } from '../app/data';
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
        <p className="muted">
          {recipe.flavorTags.join(' · ')} ·{' '}
          {recipe.status === 'draft'
            ? '草稿'
            : recipe.sourceType === 'demo'
              ? '演示菜谱'
              : '我的菜谱'}
        </p>
        <div className="row">
          <button
            className="secondary"
            aria-label={`${recipe.favorite ? '取消收藏' : '收藏'}${recipe.name}`}
            onClick={() => void run(() => repositories.recipes.favorite(recipe), '收藏已更新')}
          >
            {recipe.favorite ? '♥ 已收藏' : '♡ 收藏'}
          </button>
          {recipe.status === 'published' && (
            <Link className="button" to={`/cook/${recipe.id}`}>
              开始烹饪
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <section className="card empty">
      🍽️<p>{children}</p>
    </section>
  );
}

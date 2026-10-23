const STAR_COUNT = 5;

function countStars(value?: string) {
  if (!value) return 4;
  if (value.includes('★')) return Math.min(STAR_COUNT, Math.max(1, [...value].filter((c) => c === '★').length));
  if (value === '满意') return 4;
  if (value === '还不错') return 3;
  if (value === '下次再调整') return 2;
  return 4;
}

function toStars(count: number) {
  return `${'★'.repeat(count)}${'☆'.repeat(STAR_COUNT - count)}`;
}

export function StarRating({
  value,
  onChange,
  label = '味道评价',
}: {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const count = countStars(value);
  return (
    <div className="star-rating" role="group" aria-label={label}>
      <span className="star-rating-label">{label}</span>
      <span className="star-rating-stars">
        {Array.from({ length: STAR_COUNT }, (_, index) => {
          const star = index + 1;
          return (
            <button
              key={star}
              type="button"
              className={star <= count ? 'is-on' : ''}
              aria-label={`${star} 星`}
              aria-pressed={star === count}
              onClick={() => onChange(toStars(star))}
            >
              ★
            </button>
          );
        })}
      </span>
    </div>
  );
}

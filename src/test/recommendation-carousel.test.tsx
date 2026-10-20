import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { RecommendationCardDeck } from '../components/recommendation';
import type { RecommendedDish } from '../services/recommendationService';
import { fixtureRecipes } from './fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('今日推荐每 4.5 秒自动切换，并在鼠标悬停时暂停', () => {
  vi.useFakeTimers();
  const dishes: RecommendedDish[] = fixtureRecipes()
    .slice(0, 3)
    .map((recipe) => ({ recipe, slot: 'main', slotLabel: '推荐', reasons: [] }));

  render(
    <MemoryRouter>
      <RecommendationCardDeck dishes={dishes} />
    </MemoryRouter>,
  );

  expect(screen.getByRole('img', { name: dishes[0].recipe.name })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(4500));
  expect(screen.getByRole('img', { name: dishes[1].recipe.name })).toBeInTheDocument();

  const carousel = screen.getByRole('region', { name: '今日推荐图片轮播' });
  fireEvent.mouseEnter(carousel);
  act(() => vi.advanceTimersByTime(9000));
  expect(screen.getByRole('img', { name: dishes[1].recipe.name })).toBeInTheDocument();
});

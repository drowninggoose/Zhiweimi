import type { DiaryEntry } from '../types/models';

export type DiaryPickDraft = {
  entry: DiaryEntry;
  recipeId?: string;
};

/**
 * 挑关联菜谱期间暂存的日记草稿。
 *
 * 只放在内存里：这次跳转是 SPA 内的页面切换，内存足够；
 * 而且草稿里可能包含上传照片的 Blob，sessionStorage 无法完整保存。
 */
let pending: DiaryPickDraft | null = null;

export function readDiaryPick(): DiaryPickDraft | null {
  return pending;
}

export function writeDiaryPick(draft: DiaryPickDraft) {
  pending = draft;
}

export function clearDiaryPick() {
  pending = null;
}

import { useEffect } from 'react';
import { UserRating } from '../core/scheduler/types.ts';

interface ShortcutHandlers {
  isAnswerRevealed: boolean;
  isLocked?: boolean;
  onReveal: () => void;
  onRate: (rating: UserRating) => void;
  onUndo: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  isAnswerRevealed,
  isLocked = false,
  onReveal,
  onRate,
  onUndo,
  enabled = true,
}: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled || isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框或可编辑元素内的按键
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.code === 'Space' || key === 'enter') {
        e.preventDefault();
        if (!isAnswerRevealed) {
          onReveal();
        } else {
          onRate(UserRating.GOOD);
        }
      } else if (key === '1') {
        e.preventDefault();
        if (isAnswerRevealed) {
          onRate(UserRating.AGAIN);
        }
      } else if (key === '2') {
        e.preventDefault();
        if (isAnswerRevealed) {
          onRate(UserRating.HARD);
        }
      } else if (key === '3') {
        e.preventDefault();
        if (isAnswerRevealed) {
          onRate(UserRating.GOOD);
        }
      } else if (key === 'z') {
        e.preventDefault();
        onUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnswerRevealed, onReveal, onRate, onUndo, enabled]);
}
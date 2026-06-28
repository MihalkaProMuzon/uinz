import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Для красивого объединения Tailwind классов
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Генератор пути к SVG картинке
export function getCardImage(card: any): string {
  if (card.card_type === 'hidden' || card.color === 'hidden') {
    return '/assets/cards/back.svg'; // Рубашка
  }
  
  const color = card.color.toLowerCase();
  const type = card.card_type.toLowerCase();
  
  if (type === 'number') {
    return `/assets/cards/${color}-${type}-${card.value}.svg`;
  }
  
  // Для draw_two, skip, reverse, wild, wild_draw_four
  return `/assets/cards/${color}-${type}.svg`;
}
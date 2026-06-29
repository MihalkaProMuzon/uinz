import { GAME_CONFIG } from './config';

export function getCardsLayout(cards: any[], zone: 'hand' | 'staging') {
  const total = cards.length;
  const middle = (total - 1) / 2;
  const layout: { id: string; x: number; y: number; rotate: number; zIndex: number }[] = [];

  let overlap = GAME_CONFIG.HAND_SPACING;
  
  if (zone === 'hand' && total > 1) {
    const idealWidth = (total * GAME_CONFIG.CARD_WIDTH) - ((total - 1) * overlap);
    if (idealWidth > GAME_CONFIG.MAX_HAND_WIDTH) {
      overlap = ((total * GAME_CONFIG.CARD_WIDTH) - GAME_CONFIG.MAX_HAND_WIDTH) / (total - 1);
    }
  }

  // 👇 1. Находим максимальное смещение (значение offset для крайних карт).
  // Math.max(..., 1) защищает от деления на ноль, если в руке всего 1 карта.
  const maxOffset = Math.max((total - 1) / 2, 1);

  cards.forEach((c, i) => {
    const offset = i - middle;
    const isHand = zone === 'hand';

    // 👇 2. Считаем нормализованное смещение. Всегда от -1 до 1.
    // Если карт 3: [-1, 0, 1]
    // Если карт 4: [-1, -0.33, 0.33, 1]
    const normalizedOffset = total > 1 ? offset / maxOffset : 0;

    layout.push({
      id: c.id,
      x: offset * (GAME_CONFIG.CARD_WIDTH - (isHand ? overlap : 20)),
      
      // 👇 3. Возводим normalizedOffset в квадрат. 
      // Это сохранит идеальную параболическую дугу! (от 1 по краям до 0 в центре)
      y: isHand ? (normalizedOffset * normalizedOffset) * GAME_CONFIG.HAND_Y_OFFSET : 0,
      
      // 👇 4. Умножаем глобальный угол на число от -1 до 1.
      rotate: isHand ? normalizedOffset * GAME_CONFIG.HAND_FAN_ANGLE : 0,
      
      zIndex: i,
    });
  });

  return layout;
}
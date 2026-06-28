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

  cards.forEach((c, i) => {
    const offset = i - middle;
    const isHand = zone === 'hand';

    layout.push({
      id: c.id,
      x: offset * (GAME_CONFIG.CARD_WIDTH - (isHand ? overlap : 20)),
      y: isHand ? Math.abs(offset) * Math.abs(offset) * GAME_CONFIG.HAND_Y_OFFSET : 0,
      rotate: isHand ? offset * GAME_CONFIG.HAND_FAN_ANGLE : 0,
      zIndex: i,
    });
  });

  return layout;
}
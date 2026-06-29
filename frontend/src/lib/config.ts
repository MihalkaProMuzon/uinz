import { DiscardPile } from "../components/DiscardPile";

const ANIMATION_SPEED = 0.4;

export const GAME_CONFIG = {
  // Базовые размеры
  CARD_WIDTH: 100,
  CARD_HEIGHT: 130,
  
  // Координаты центра стола (Банк и Сброс)
  TABLE_CENTER_Y_VH: 40, // в vh (проценты от высоты экрана)
  BANK_OFFSET_X: 220,    // Сдвиг банка вправо в пикселях

  // Найстройки Сброса
  DISCARD_PILE_CARD_RND_OFFSET_X: 30, 
  DISCARD_PILE_CARD_RND_OFFSET_Y: 30, 
  DISCARD_PILE_CARD_RND_ROT: 40,
  MAX_VISIBLE_DISCARD: 7,

  // Зона подготовки (Декорации и кнопки)
  STAGE_BOX_WIDTH: 300,
  STAGE_BOX_HEIGHT: 140,
  STAGE_BOX_BOTTOM: 195, // Позиция декоративной рамки снизу
  PLAY_BTN_BOTTOM: 135,  // Позиция кнопки "Сыграть"
  PALETTE_BOTTOM: 338,   // Позиция палитры цветов

  // Физические координаты для карт (Y от низа экрана)
  HAND_Y_POS: -125,       // Базовая линия для руки
  STAGE_ZONE_Y: -330,    // Точка, куда физически летят карты в зоне подготовки
  STAGE_DROP_Y: -180,    // Порог по Y, выше которого срабатывает drop в зону подготовки

  // Задержки
  FINISH_DELAY: 1500,

  // Математика веера
  HAND_FAN_ANGLE: 5,
  HAND_Y_OFFSET: -15,
  HAND_SPACING: 40, 
  MAX_HAND_WIDTH: 600,
  
  // Оппоненты
  OPPONENT_RADIUS_X: 40,
  OPPONENT_RADIUS_Y: 25,
  MAX_OPPONENT_CARDS: 12,    
  
  CARD_HOVER_OFFSET: 30,
  SWAP_THRESHOLD: 5, // Насколько глубоко нужно "залезть" на соседнюю карту, чтобы она сдвинулась.
  DEFAULT_WILD_COLOR: 'red',
  DECK_MAX_THICKNESS: 1,

  ANIMATION_SPEED, 

  TRANSITIONS: {
    UI: { duration: ANIMATION_SPEED, ease: "easeOut" } as const,
    FLY: { type: "spring", stiffness: 250, damping: 25, mass: 1 } as const,
    HOVER: { type: "spring", stiffness: 400, damping: 20 } as const
  }
};
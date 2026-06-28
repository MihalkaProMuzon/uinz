const ANIMATION_SPEED = 0.3;

export const GAME_CONFIG = {
  // Базовые размеры
  CARD_WIDTH: 100,
  CARD_HEIGHT: 130,
  
  // Координаты центра стола (Банк и Сброс)
  TABLE_CENTER_Y_VH: 40, // в vh (проценты от высоты экрана)
  BANK_OFFSET_X: 220,    // Сдвиг банка вправо в пикселях

  // Зона подготовки (Декорации и кнопки)
  STAGE_BOX_WIDTH: 300,
  STAGE_BOX_HEIGHT: 140,
  STAGE_BOX_BOTTOM: 195, // Позиция декоративной рамки снизу
  PLAY_BTN_BOTTOM: 135,  // Позиция кнопки "Сыграть"
  PALETTE_BOTTOM: 338,   // Позиция палитры цветов

  // Физические координаты для карт (Y от низа экрана)
  HAND_Y_POS: -120,       // Базовая линия для руки
  STAGE_ZONE_Y: -330,    // Точка, куда физически летят карты в зоне подготовки
  STAGE_DROP_Y: -160,    // Порог по Y, выше которого срабатывает drop в зону подготовки

  // Задержки
  FINISH_DELAY: 1500,

  // Математика веера
  HAND_FAN_ANGLE: 2,
  HAND_Y_OFFSET: -2,
  HAND_SPACING: 30, 
  MAX_HAND_WIDTH: 600,       
  
  // Оппоненты
  OPPONENT_RADIUS_X: 40,
  OPPONENT_RADIUS_Y: 25,
  MAX_OPPONENT_CARDS: 12,    
  
  CARD_HOVER_OFFSET: 25,
  DEFAULT_WILD_COLOR: 'red',
  MAX_VISIBLE_DISCARD: 15,
  DECK_MAX_THICKNESS: 15,

  ANIMATION_SPEED, 

  TRANSITIONS: {
    UI: { duration: ANIMATION_SPEED, ease: "easeOut" } as const,
    FLY: { type: "spring", stiffness: 250, damping: 25, mass: 1 } as const,
    HOVER: { type: "spring", stiffness: 400, damping: 20 } as const
  }
};
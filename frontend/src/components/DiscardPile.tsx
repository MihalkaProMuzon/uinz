import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';
import { GAME_CONFIG } from '../lib/config';

const getSeededRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return (Math.abs(hash) % 100) / 100; 
};

export function DiscardPile({ cards, declaredColor, actionLog, meId, players }: { cards: any[], declaredColor?: string, actionLog?: any[], meId?: string, players?: any[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 1. Инициализируем память карт СИНХРОННО при первом рендере.
  // Так карты, которые уже были на столе при загрузке страницы, не будут вылетать заново.
  const knownIds = useRef<Set<string> | null>(null);
  if (knownIds.current === null) {
    knownIds.current = new Set(cards.map(c => c.id));
  }

  // 2. Очистка старых ID (чтобы не было утечек памяти, если начнется новая игра)
  useEffect(() => {
    const currentIds = new Set(cards.map(c => c.id));
    for (const id of knownIds.current!) {
      if (!currentIds.has(id)) {
        knownIds.current!.delete(id);
      }
    }
  }, [cards]);

  const visibleCards = cards.slice(-GAME_CONFIG.MAX_VISIBLE_DISCARD);
  if (visibleCards.length === 0) return null;

  const topCard = visibleCards[visibleCards.length - 1];

  // Находим, кто сделал последний ход, чтобы понять, откуда должны вылетать карты
  const lastPlayAction = actionLog?.slice().reverse().find(a => a.type === 'play');
  const wasPlayedByMe = lastPlayAction?.player_id === meId;

  // --- ТОЧНАЯ МАТЕМАТИКА ВЫЛЕТА ---
  let startX = 0;
  let startY = -400; // Резервный вылет "сверху" (например, первая карта при старте игры)

  if (lastPlayAction && !wasPlayedByMe && players) {
    const opponents = players.filter(p => p.id !== meId);
    const oppIndex = opponents.findIndex(p => p.id === lastPlayAction.player_id);
    
    if (oppIndex !== -1) {
      const angle = opponents.length === 1 ? Math.PI / 2 : (Math.PI * (0.15 + 0.7 * (oppIndex / (opponents.length - 1))));
      const oppVw = Math.cos(angle) * GAME_CONFIG.OPPONENT_RADIUS_X;
      const oppVh = Math.sin(angle) * GAME_CONFIG.OPPONENT_RADIUS_Y - 2; 
      
      startX = (-oppVw / 100) * window.innerWidth;
      startY = ((oppVh - 42) / 100) * window.innerHeight;
    }
  }

  // 3. Вычисляем ВСЕ новые карты, прилетевшие в этом конкретном рендере
  const newVisibleCards = visibleCards.filter(c => !knownIds.current!.has(c.id));

  return (
    <div 
      className="relative flex items-center justify-center w-[400px] h-[250px] z-10"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {visibleCards.map((card, index) => {
        // Проверяем, является ли текущая карточка новой
        const isNewCard = !knownIds.current!.has(card.id);
        
        // Узнаем её порядковый номер среди НОВЫХ карт (0, 1, 2...)
        const delayIndex = newVisibleCards.findIndex(c => c.id === card.id);
        
        // МАГИЯ ЗАДЕРЖКИ: Первая летит сразу (0с), вторая через 0.15с, третья через 0.3с и т.д.
        const animationDelay = (isNewCard && delayIndex > 0) ? delayIndex * 0.15 : 0;

        const base = getSeededRandom(card.id);
        const randRot = (base * 3.149796) % 1;
        const randOffsetX = (base * 7.9734652375) % 1;
        const randOffsetY = (base * 13.098234659823) % 1;

        const rot = (randRot - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_ROT;
        const offsetX = (randOffsetX - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_OFFSET_X;
        const offsetY = (randOffsetY - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_OFFSET_Y;
        const expandedX = (index - visibleCards.length + 1) * 60;

        return (
          <motion.div
            key={card.id}
            layout
            // Стартовые пропсы применяются только если карта новая
            initial={isNewCard ? { 
              opacity: 0, 
              scale: 0.3, 
              x: wasPlayedByMe ? 0 : startX,
              y: wasPlayedByMe ? 400 : startY, 
              rotate: wasPlayedByMe ? 0 : randRot 
            } : false}
            animate={{
              x: isExpanded ? expandedX : offsetX,
              y: isExpanded ? 0 : offsetY,
              rotate: isExpanded ? 0 : rot,
              scale: isExpanded ? 0.9 : 1,
              opacity: 1,
              zIndex: index,
            }}
            transition={{ 
              duration: GAME_CONFIG.ANIMATION_SPEED, 
              type: "tween", 
              ease: "easeOut",
              delay: animationDelay // <-- ПРИМЕНЯЕМ КАСКАДНУЮ ЗАДЕРЖКУ СЮДА
            }}
            onAnimationComplete={() => {
              // Когда карта приземлилась, записываем её в "уже увиденные"
              if (isNewCard) {
                knownIds.current!.add(card.id);
              }
            }}
            className="absolute shadow-xl pointer-events-none"
          >
            <Card card={card} />
          </motion.div>
        );
      })}

      {/* ПЛАШКА ЗАКАЗАННОГО ЦВЕТА */}
      {declaredColor && topCard?.color === 'black' && !isExpanded && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.5, y: 20 }} 
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="absolute -bottom-10 px-6 py-2 rounded-full text-white font-black text-sm shadow-[0_5px_15px_rgba(0,0,0,0.5)] border-2 border-white z-[100] pointer-events-none"
          style={{ backgroundColor: declaredColor === 'yellow' ? '#fbbf24' : declaredColor }}
        >
          ЗАКАЗАН: {declaredColor.toUpperCase()}
        </motion.div>
      )}
    </div>
  );
}
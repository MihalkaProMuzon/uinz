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
  const animatedPlayActions = useRef<Set<string>>(new Set());

  const lastPlayAction = actionLog?.slice().reverse().find(a => a.type === 'play');
  const isNewPlay = lastPlayAction && !animatedPlayActions.current.has(lastPlayAction.action_id);
  
  useEffect(() => {
    if (isNewPlay && lastPlayAction) {
      animatedPlayActions.current.add(lastPlayAction.action_id);
    }
  }, [isNewPlay, lastPlayAction]);

  const visibleCards = cards.slice(-GAME_CONFIG.MAX_VISIBLE_DISCARD);
  if (visibleCards.length === 0) return null;

  const topCard = visibleCards[visibleCards.length - 1];
  const wasPlayedByMe = lastPlayAction?.player_id === meId;

  // --- ТОЧНАЯ МАТЕМАТИКА ВЫЛЕТА ИЗ ОППОНЕНТА ---
  let startX = 0;
  let startY = -400; // Резервный вылет "сверху", если что-то пошло не так

  if (isNewPlay && lastPlayAction && !wasPlayedByMe && players) {
    const opponents = players.filter(p => p.id !== meId);
    const oppIndex = opponents.findIndex(p => p.id === lastPlayAction.player_id);
    
    if (oppIndex !== -1) {
      const angle = opponents.length === 1 ? Math.PI / 2 : (Math.PI * (0.15 + 0.7 * (oppIndex / (opponents.length - 1))));
      // Сброс находится по центру экрана (left: 50%).
      // Оппонент сдвинут на `x` vw влево.
      const oppVw = Math.cos(angle) * GAME_CONFIG.OPPONENT_RADIUS_X;
      // Оппонент висит на `y` vh сверху. Сброс висит на 42vh.
      const oppVh = Math.sin(angle) * GAME_CONFIG.OPPONENT_RADIUS_Y - 2; 
      
      // Вычисляем дельту от Сброса ДО Оппонента в пикселях:
      startX = (-oppVw / 100) * window.innerWidth;
      startY = ((oppVh - 42) / 100) * window.innerHeight;
    }
  }

  return (
    <div 
      className="relative flex items-center justify-center w-[400px] h-[250px] z-10"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {visibleCards.map((card, index) => {
        const isNewestCard = index === visibleCards.length - 1;

        const base = getSeededRandom(card.id);
        const randRot = (base * 3.149796) % 1;
        const randOffsetX = (base * 7.9734652375) % 1;
        const randOffsetY = (base * 13.098234659823) % 1;

        const rot = (randRot - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_ROT;
        const offsetX = (randOffsetX - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_OFFSET_X;
        const offsetY = (randOffsetY - 0.5) * GAME_CONFIG.DISCARD_PILE_CARD_RND_OFFSET_Y;
        const expandedX = (index - visibleCards.length + 1) * 60;

        const shouldAnimateSpawn = isNewestCard && isNewPlay;

        return (
          <motion.div
            key={card.id}
            layout
            // Карта стартует либо снизу от тебя (Y: 400), либо СТРОГО из пикселей Оппонента
            initial={shouldAnimateSpawn ? { 
              opacity: 0, 
              scale: 0.3, // Вылетает мелкой из аватара
              x: wasPlayedByMe ? 0 : startX,
              y: wasPlayedByMe ? 400 : startY, 
              rotate: wasPlayedByMe ? 0 : randRot 
            } : false}
            animate={{
              x: isExpanded ? expandedX : offsetX,
              y: isExpanded ? 0 : offsetY,
              rotate: isExpanded ? 0 : rot,
              scale: isExpanded ? 0.9 : 1, // Прилетает в норм размер
              opacity: 1,
              zIndex: index,
            }}
            transition={{ duration: GAME_CONFIG.ANIMATION_SPEED, type: "tween", ease: "easeOut" }}
            className="absolute shadow-xl pointer-events-none"
          >
            <Card card={card} />
          </motion.div>
        );
      })}

      {/* ПЛАШКА ЗАКАЗАННОГО ЦВЕТА (ИСПРАВЛЕННАЯ) */}
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
import { GAME_CONFIG } from '../lib/config';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

interface OpponentsProps {
  players: any[];
  meId: string;
  currentTurnId: string;
  actionLog?: any[];
}

export function Opponents({ players, meId, currentTurnId, actionLog }: OpponentsProps) {
  const opponents = players.filter(p => p.id !== meId);
  const [flyingCards, setFlyingCards] = useState<any[]>([]);
  
  // УМНЫЙ ТРЕКИНГ: Запоминаем ID действий, которые мы уже анимировали
  const processedActions = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!actionLog) return;
    
    // Ищем только те действия, которые мы еще не видели
    const newActions = actionLog.filter(a => !processedActions.current.has(a.action_id));
    
    newActions.forEach(action => {
      processedActions.current.add(action.action_id); // Помечаем как обработанное
      
      if (action.type === 'take_cards' && action.player_id !== meId && action.count > 0) {
        const newFlying = Array.from({ length: action.count }).map((_, i) => ({
          id: `fly-${action.action_id}-${i}`,
          targetPlayerId: action.player_id,
          delay: i * 0.15 
        }));
        
        setFlyingCards(prev => [...prev, ...newFlying]);
        
        setTimeout(() => {
          setFlyingCards(prev => prev.filter(c => !newFlying.find(n => n.id === c.id)));
        }, 1500 + (action.count * 150));
      }
    });
  }, [actionLog]);

  if (opponents.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-[40vh] pointer-events-none z-10">
      {opponents.map((opp, index) => {
        const angle = opponents.length === 1 ? Math.PI / 2 : (Math.PI * (0.15 + 0.7 * (index / (opponents.length - 1)))); 
        const x = Math.cos(angle) * GAME_CONFIG.OPPONENT_RADIUS_X;
        const y = Math.sin(angle) * GAME_CONFIG.OPPONENT_RADIUS_Y - 2;
        const isHisTurn = opp.id === currentTurnId;
        const incomingCards = flyingCards.filter(c => c.targetPlayerId === opp.id);

        return (
          <div 
            key={opp.id}
            className="absolute flex flex-col items-center transition-all duration-500"
            style={{ left: `calc(50% - ${x}vw)`, top: `${y}vh`, transform: 'translate(-50%, -50%)' }}
          >
            <div className={`px-5 py-2 rounded-full font-bold text-white shadow-lg border-2 z-20 transition-all ${isHisTurn ? 'bg-green-500 border-white scale-110 shadow-[0_0_20px_rgba(34,197,94,0.6)]' : 'bg-gray-800 border-gray-600 opacity-90'}`}>
              {opp.is_host && '👑 '}{opp.wants_to_spectate && '👁️ '}{opp.name}
            </div>
            
           <AnimatePresence>
              {incomingCards.map(flyCard => {
                // --- ТОЧНАЯ МАТЕМАТИКА ОТ БАНКА ДО ОППОНЕНТА ---
                // Оппонент сидит на `left: 50% - x vw`, `top: y vh`.
                // Банк сидит на `left: 50% + 220px`, `top: 42vh`.
                // Высчитываем разницу в пикселях:
                const startX = 220 + (x / 100 * window.innerWidth);
                const startY = ((42 - y) / 100 * window.innerHeight);

                return (
                  <motion.div
                    key={flyCard.id}
                    // Старт: координаты Банка, оригинальный размер (1), полная видимость
                    initial={{ opacity: 1, x: startX, y: startY, scale: 1, rotate: 0 }} 
                    // Конец: центр Аватара оппонента (x:0, y:0), ужимается в размер карты (0.25), исчезает
                    animate={{ opacity: 0, x: 0, y: 0, scale: 0.25, rotate: 0 }} 
                    exit={{ opacity: 0 }}
                    transition={{ duration: GAME_CONFIG.ANIMATION_SPEED, delay: flyCard.delay, type: "tween", ease: "easeOut" }}
                    // Дизайн этой летящей карты СТРОГО совпадает с дизайном Банка:
                    className="absolute w-[120px] h-[160px] bg-neutral-800 border-4 border-neutral-700 rounded-xl shadow-2xl flex items-center justify-center z-50"
                  >
                    <span className="text-neutral-500 font-black rotate-[-45deg] text-xl">UNO</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Рубашки карт (мини-веер оппонента с лимитом) */}
            {opp.is_playing && (
              <div className="flex justify-center mt-3" style={{ width: '60px' }}>
                {/* 👇 НОВОЕ: Ограничиваем массив для визуала 👇 */}
                {Array.from({ length: Math.min(opp.hand.length, GAME_CONFIG.MAX_OPPONENT_CARDS) }).map((_, i, arr) => (
                  <div 
                    key={i} 
                    className="w-[30px] h-[45px] bg-gray-900 border-2 border-gray-700 rounded shadow-md flex items-center justify-center -ml-4 first:ml-0"
                    // Высчитываем наклон исходя из обрезанного массива, чтобы веер всегда был ровным
                    style={{ transform: `rotate(${(i - arr.length/2) * 5}deg)` }}
                  >
                    <span className="text-[8px] text-gray-500 font-bold">U</span>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-2 text-xs text-white bg-black/60 px-3 py-1 rounded-full border border-white/10 z-20">
              Карт: <span className="font-bold text-fuchsia-400">{opp.hand.length}</span> | 🏆 {opp.wins}
            </div>
          </div>
        );
      })}
    </div>
  );
}
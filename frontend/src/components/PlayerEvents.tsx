import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GAME_CONFIG } from '../lib/config';

interface PlayerEventsProps {
  playerId: string;
  actionLog: any[];
  players: any[];
}

export function PlayerEvents({ playerId, actionLog, players }: PlayerEventsProps) {
  const [events, setEvents] = useState<any[]>([]);
  const processedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!actionLog) return;
    
    const now = Date.now(); // Текущее время на клиенте

    // Ищем только новые экшены, которые моложе нашего лимита
    const newActions = actionLog.filter(a => {
      const isNew = !processedIds.current.has(a.action_id);
      // Если timestamp нет (на случай старых логов), считаем что он подходит (true)
      const isFresh = a.timestamp ? (now - a.timestamp < GAME_CONFIG.UNO_ACTION_MAX_AGE_MS) : true;
      return isNew && isFresh;
    });
    
    newActions.forEach(action => {
        processedIds.current.add(action.action_id);
      
        // Сценарий 1: Игрок сказал УНО
        if (action.type === 'say_uno' && action.player_id === playerId) {
            addEvent('say_uno', 'УНО!', '#22c55e'); // Ярко-зеленый
        }
        
        // Сценарий 2: Кто-то кого-то поймал
        if (action.type === 'catch_uno') {
            if (action.player_id === playerId) {
            // Если этот игрок - ЛОВЕЦ
            const caughtName = players.find(p => p.id === action.caught_id)?.name || 'ИГРОКА';
            addEvent('catch_catcher', `ПОЙМАЛ ${caughtName.toUpperCase()}!`, '#ef4444'); // Красный
            } else if (action.caught_id === playerId) {
            // Если этот игрок - ЖЕРТВА
            addEvent('catch_caught', 'ШТРАФ!', '#dc2626'); // Темно-красный
            }
        }
    });
  }, [actionLog, playerId, players]);

  const addEvent = (type: string, text: string, hexColor: string) => {
    const id = Math.random().toString();
    // Легкий случайный наклон от -15 до 15 градусов для комиксного эффекта
    const rotate = (Math.random() - 0.5) * 30;
    
    setEvents(prev => [...prev, { id, type, text, hexColor, rotate }]);
    
    // Удаляем надпись через 3 секунды
    setTimeout(() => {
      setEvents(prev => prev.filter(e => e.id !== id));
    }, 3000);
  }

  return (
    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full flex flex-col items-center justify-end pointer-events-none z-[9999] h-0 overflow-visible">
      <AnimatePresence>
        {events.map((e, index) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, scale: 0.5, y: 0, rotate: e.rotate }}
            animate={{ opacity: 1, scale: 1, y: 200 - (index * 60), rotate: e.rotate }}

            exit={{ 
              opacity: 0, 
              scale: 1.2, 
              y: 180 - (index * 60), 
              transition: { duration: 2, ease: "easeOut" } 
            }}

            transition={{ duration: 0.6, type: "spring", bounce: 0.5 }}
            className="text-5xl sm:text-6xl font-black uppercase whitespace-nowrap mb-4 tracking-wider"
            style={{
              color: 'black',
              WebkitTextStroke: '2px ' + e.hexColor, // Жирная черная обводка
              textShadow: '4px 4px 0 #160101, 0px 10px 20px rgba(255, 255, 255, 0.8)' // Густая тень как в комиксах
            }}
          >
            {e.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
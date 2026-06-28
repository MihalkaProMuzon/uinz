import { useState, useMemo, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay, pointerWithin, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useGameState } from './hooks/useGameState';
import { Card } from './components/Card';
import { DiscardPile } from './components/DiscardPile';
import { Opponents } from './components/Opponents';
import { getCardsLayout } from './lib/math';
import { GAME_CONFIG } from './lib/config';

type LocalCard = any & { zone: 'hand' | 'staging' };

export default function App() {
  const { name, setName, roomId, setRoomId, isConnected, gameState, lastError, connect, sendAction } = useGameState();
  
  // ЕДИНЫЙ МАССИВ КАРТ
  const [localCards, setLocalCards] = useState<LocalCard[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('red');

  const me = gameState?.players.find((p: any) => p.name === name);
  const currentPlayer = gameState?.players[gameState?.current_turn_index];
  const isMyTurn = me?.id === currentPlayer?.id && me?.is_playing && gameState?.status === 'playing';
  const penaltyCards = gameState?.penalty_cards || 0;
  const needsToTakePenalty = isMyTurn && penaltyCards > 0;
  
  const [localHand, setLocalHand] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<any | null>(null);
  const [isOverStaging, setIsOverStaging] = useState(false); // Для стабильной фиолетовой рамки

  const sensorOptions = useMemo(() => ({ activationConstraint: { distance: 5 } }), []);
  const sensors = useSensors(useSensor(PointerSensor, sensorOptions));
  

  const [delayedStatus, setDelayedStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!gameState) return;
    
    if (gameState.status === 'finished') {
      // Если игра закончилась, ждем 2.5 секунды (чтобы карта долетела), затем показываем экран победы
      const timer = setTimeout(() => setDelayedStatus('finished'), GAME_CONFIG.FINISH_DELAY);
      return () => clearTimeout(timer);
    } else {
      // Иначе (ожидание или игра) обновляем статус мгновенно
      setDelayedStatus(gameState.status);
    }
  }, [gameState?.status]);
  

  // --- СИНХРОНИЗАЦИЯ СОСТОЯНИЯ ---
  useEffect(() => {
    if (!gameState || !me || !me.is_playing) return setLocalCards([]);
    
    setLocalCards(prev => {
      const serverHand = me.hand;
      // 1. Оставляем только те карты, что есть на сервере, сохраняя их зону
      const validLocal = prev.filter(p => serverHand.some((s: any) => s.id === p.id));
      // 2. Новые карты всегда падают в 'hand'
      const newCards = serverHand.filter((s: any) => !prev.some(p => p.id === s.id)).map((c: any) => ({ ...c, zone: 'hand' }));
      return [...validLocal, ...newCards];
    });
  }, [gameState, name]);

  // Возврат карт при ошибке (сбрасываем всем зону на 'hand')
  useEffect(() => {
    if (lastError > 0 && me) {
      setLocalCards(me.hand.map((c: any) => ({ ...c, zone: 'hand' })));
    }
  }, [lastError]);

  // --- ЛОГИКА DRAG & DROP И СОРТИРОВКИ ---
  const handleDragEnd = (e: any, info: any, cardId: string) => {
    setActiveCardId(null);
    if (!isMyTurn || needsToTakePenalty) return;

    // Y порог для попадания в зону подготовки
    const dropY = info.point.y;
    const isStaging = dropY < window.innerHeight + GAME_CONFIG.STAGE_DROP_Y;
    const targetZone = isStaging ? 'staging' : 'hand';

    // X координата падения относительно центра экрана
    const dropX = info.point.x - (window.innerWidth / 2);

    setLocalCards(prev => {
      const movingCard = prev.find(c => c.id === cardId);
      if (!movingCard) return prev;

      const newCards = prev.filter(c => c.id !== cardId);
      const targetCards = newCards.filter(c => c.zone === targetZone);
      const otherCards = newCards.filter(c => c.zone !== targetZone);

      // Получаем макет целевой зоны, чтобы понять, куда (по X) вставить карту
      const layout = getCardsLayout(targetCards, targetZone);
      let insertIdx = targetCards.length;
      for (let i = 0; i < layout.length; i++) {
        if (dropX < layout[i].x) {
          insertIdx = i;
          break;
        }
      }

      movingCard.zone = targetZone;
      targetCards.splice(insertIdx, 0, movingCard);

      // Возвращаем склеенный массив
      return targetZone === 'hand' ? [...targetCards, ...otherCards] : [...otherCards, ...targetCards];
    });
  };

  const stagedCards = localCards.filter(c => c.zone === 'staging');
  const needsColor = stagedCards.some(c => c.color === 'black');

  const handlePlayCards = () => {
    sendAction('play_cards', { card_ids: stagedCards.map(c => c.id), declared_color: needsColor ? selectedColor : undefined });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4">
        <input className="mb-4 p-3 rounded text-black w-64" placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
        <input className="mb-4 p-3 rounded text-black w-64" placeholder="Комната" value={roomId} onChange={e => setRoomId(e.target.value)} onKeyDown={e => e.key === 'Enter' && connect(name, roomId)} />
        <button onClick={() => connect(name, roomId)} className="w-64 p-3 bg-fuchsia-600 text-white rounded font-bold">ВОЙТИ</button>
      </div>
    );
  }

  if (!gameState) {
    return <div className="min-h-screen bg-neutral-900 flex items-center justify-center"><h2 className="text-2xl text-white font-bold animate-pulse">Синхронизация...</h2></div>;
  }

  if (delayedStatus === 'waiting' || delayedStatus === 'finished') {
    const isFinished = delayedStatus === 'finished';
    const winner = isFinished ? gameState.players.find((p: any) => p.hand.length === 0 && p.is_playing) : null;
    const isHost = me?.is_host;
    const activePlayersCount = gameState.players.filter((p: any) => !p.wants_to_spectate).length;

    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
        <div className="w-full max-w-3xl bg-neutral-800 p-6 sm:p-10 rounded-3xl shadow-2xl">
          {isFinished ? (
            <div className="text-center mb-8 bg-yellow-500/10 p-6 rounded-2xl border-2 border-yellow-500/50">
              <h1 className="text-4xl sm:text-5xl font-black text-yellow-400 mb-3 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">🎉 ИГРА ОКОНЧЕНА 🎉</h1>
              <h2 className="text-2xl text-white">Победитель: <span className="font-bold">{winner?.name}</span></h2>
            </div>
          ) : (
            <div className="mb-8 border-b border-neutral-700 pb-6">
              <h1 className="text-3xl sm:text-4xl font-black text-fuchsia-400 tracking-wide">ЛОББИ: <span className="text-white">«{roomId}»</span></h1>
            </div>
          )}

          <div className="mb-10">
            <h3 className="text-xl font-bold text-neutral-400 mb-4 uppercase tracking-wider">Участники ({gameState.players.length})</h3>
            <div className="flex flex-col gap-3">
              {gameState.players.map((p: any) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-neutral-700/50 p-4 rounded-xl border border-neutral-700">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl" title="Хост">{p.is_host ? '👑' : ''}</span>
                    <span className="text-2xl" title={p.wants_to_spectate ? 'Зритель' : 'Игрок'}>{p.wants_to_spectate ? '👁️' : '🎮'}</span>
                    <div>
                      <span className="font-bold text-lg text-white">{p.name} {p.id === me?.id && <span className="text-fuchsia-400 text-sm">(Ты)</span>}</span>
                      <div className="text-neutral-400 text-sm font-medium mt-1">🏆 Побед: {p.wins}</div>
                    </div>
                  </div>
                  {isHost && p.id !== me?.id && (
                    <button onClick={() => sendAction('transfer_host', { target_id: p.id })} className="mt-3 sm:mt-0 text-sm bg-neutral-600 hover:bg-neutral-500 text-white px-4 py-2 rounded-lg transition-colors">Сделать Хостом</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-neutral-900 p-6 rounded-2xl border border-neutral-700">
            <button onClick={() => sendAction('toggle_spectator')} className="w-full sm:w-auto px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl font-bold transition-colors">
              {me?.wants_to_spectate ? 'Стать Игроком' : 'Стать Зрителем'}
            </button>
            {isHost ? (
              isFinished ? (
                <button onClick={() => sendAction('reset_lobby')} className="w-full sm:w-auto px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-transform hover:scale-105">
                  В ЛОББИ (ПЕРЕСОЗДАТЬ)
                </button>
              ) : (
                <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
                  {activePlayersCount < 2 && <span className="text-red-400 font-bold mb-2 text-sm">Нужно минимум 2 игрока</span>}
                  <button onClick={() => sendAction('start_game')} disabled={activePlayersCount < 2} className={`w-full sm:w-auto px-8 py-3 font-black rounded-xl transition-all ${activePlayersCount < 2 ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-[0_0_15px_rgba(192,38,211,0.5)] transform hover:scale-105'}`}>
                    ЗАПУСТИТЬ ИГРУ
                  </button>
                </div>
              )
            ) : (
              <div className="text-neutral-400 italic text-center sm:text-right">Ожидаем запуск от Хоста...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- ВЫЧИСЛЕНИЕ КООРДИНАТ ДЛЯ РЕНДЕРА ---
  const handCards = localCards.filter(c => c.zone === 'hand');
  const handLayout = getCardsLayout(handCards, 'hand');
  const stagingLayout = getCardsLayout(stagedCards, 'staging');

 return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-teal-900 to-black text-white overflow-hidden">

      {/* ... ИНДИКАТОРЫ ХОДА И ОППОНЕНТЫ */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-none transition-all">
        {isMyTurn ? (
          <div className={`px-8 py-3 text-white font-black text-2xl rounded-full border-2 border-white shadow-[0_0_30px_rgba(34,197,94,0.8)] animate-bounce ${needsToTakePenalty ? 'bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.8)]' : 'bg-green-500'}`}>
            {needsToTakePenalty ? 'Возьми карты!' : '🔥 Твой ход!'}
          </div>
        ) : (
          <div className="px-8 py-3 bg-neutral-900/80 backdrop-blur text-white font-bold text-xl rounded-full shadow-lg border-2 border-neutral-600">
            ⏳ Ходит: <span className="text-fuchsia-400">{currentPlayer?.name}</span>
          </div>
        )}
        {penaltyCards > 0 && (
          <div className="mt-3 px-6 py-2 bg-red-900/90 text-red-100 font-bold rounded-full border border-red-500 animate-pulse text-sm shadow-xl">
            ⚠️ Ожидается взятие штрафа: {penaltyCards} шт.
          </div>
        )}
      </div>

      <Opponents 
        players={gameState.players} 
        meId={me?.id} 
        currentTurnId={currentPlayer?.id} 
        actionLog={gameState.action_log}
      />

      
      {/* СБРОС И БАНК */}
      <div 
        className="absolute left-1/2 w-full -translate-x-1/2 -translate-y-1/2 pointer-events-none flex justify-center items-center"
        style={{ top: `${GAME_CONFIG.TABLE_CENTER_Y_VH}vh` }} // 👈 Читаем из конфига
      >
        <div className="relative pointer-events-auto z-20">
          <DiscardPile 
            cards={gameState.discard_pile} 
            declaredColor={gameState.declared_color} 
            actionLog={gameState.action_log}
            meId={me?.id}
            players={gameState.players}
          />
        </div>
        
        {/* Банк */}
        <div 
          onClick={() => isMyTurn && !gameState.has_drawn_this_turn && !needsToTakePenalty && sendAction('draw_card')}
          className={`absolute left-1/2 bg-neutral-800 rounded-xl border-4 border-neutral-700 flex items-center justify-center shadow-2xl transition-all pointer-events-auto ${isMyTurn && !gameState.has_drawn_this_turn && !needsToTakePenalty ? 'cursor-pointer hover:scale-105 hover:-translate-y-2 border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.4)]' : 'opacity-80'}`}
          style={{ 
            width: GAME_CONFIG.CARD_WIDTH,       // 👈 Наследует ширину
            height: GAME_CONFIG.CARD_HEIGHT,     // 👈 Наследует высоту
            marginLeft: GAME_CONFIG.BANK_OFFSET_X // 👈 Наследует отступ
          }}
        >
          <span className="text-neutral-500 font-black rotate-[-45deg] text-xl">UNO</span>
          <div className="absolute -bottom-5 text-xs text-white/70 bg-black/60 px-3 py-1 rounded-full border border-white/10 font-bold whitespace-nowrap">
            В колоде: {gameState.deck.length}
          </div>
        </div>
      </div>


       {/* РУКА И ЗОНА ПОДГОТОВКИ */}
      {me.is_playing && (
        <div className="fixed bottom-0 left-1/2 w-0 h-0 pointer-events-none z-40">
          
          {/* ДЕКОРАТИВНАЯ ЗОНА ПОДГОТОВКИ */}
          {(!needsToTakePenalty && isMyTurn) && (
            <div 
              className="absolute left-1/2 -translate-x-1/2 p-4 rounded-3xl border-4 border-dashed border-white/30 bg-black/20"
              style={{
                bottom: GAME_CONFIG.STAGE_BOX_BOTTOM, // 👈 Из конфига
                width: GAME_CONFIG.STAGE_BOX_WIDTH,   // 👈 Из конфига
                height: GAME_CONFIG.STAGE_BOX_HEIGHT  // 👈 Из конфига
              }} 
            />
          )}

          {/* ПАЛИТРА ЦВЕТОВ */}
          {needsColor && stagedCards.length > 0 && !needsToTakePenalty && isMyTurn && (
            <div 
              className="absolute left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-white/80 backdrop-blur rounded-full shadow-lg border pointer-events-auto"
              style={{ bottom: GAME_CONFIG.PALETTE_BOTTOM }} 
            >
              {['red', 'green', 'blue', 'yellow'].map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-125 border-black shadow-md' : 'border-transparent'}`}
                  style={{ backgroundColor: c === 'yellow' ? '#fbbf24' : c }}
                />
              ))}
            </div>
          )}

          {/* КНОПКА СЫГРАТЬ */}
          {stagedCards.length > 0 && !needsToTakePenalty && isMyTurn && (
            <button 
              onClick={handlePlayCards}
              className="absolute left-1/2 -translate-x-1/2 px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-300 text-white font-black text-xl rounded-full shadow-[0_0_15px_rgba(192,38,211,0.5)] transform hover:scale-105 transition-all w-max pointer-events-auto"
              style={{ bottom: GAME_CONFIG.PLAY_BTN_BOTTOM }}
            >
              СЫГРАТЬ ({stagedCards.length})
            </button>
          )}

          {/* РЕНДЕР ВСЕХ КАРТ В ЕДИНОМ СЛОЕ */}
          {localCards.map(card => {
            const isHand = card.zone === 'hand';
            const layout = isHand 
              ? handLayout.find(l => l.id === card.id)! 
              : stagingLayout.find(l => l.id === card.id)!;
            
            // Базовые высоты: рука на 60px от низа, зона подготовки на 310px от низа
            const targetY = isHand ? GAME_CONFIG.HAND_Y_POS - layout.y : GAME_CONFIG.STAGE_ZONE_Y;
            const isDragging = activeCardId === card.id;

            return (
              <Card
                key={card.id}
                card={card}
                className="pointer-events-auto" // Возвращаем кликабельность картам
                onDragStart={() => {
                  if (isMyTurn && !needsToTakePenalty) setActiveCardId(card.id);
                }}
                onDragEnd={(e, info) => handleDragEnd(e, info, card.id)}
                animate={{
                  x: layout.x,
                  y: targetY,
                  rotate: layout.rotate,
                  zIndex: isDragging ? 100 : layout.zIndex + (isHand ? 0 : 50) // Зона подготовки всегда выше руки
                }}
                whileHover={isHand ? { 
                  y: targetY - GAME_CONFIG.CARD_HOVER_OFFSET, 
                  rotate: layout.rotate,  
                } : {}}
                transition={GAME_CONFIG.TRANSITIONS.UI}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
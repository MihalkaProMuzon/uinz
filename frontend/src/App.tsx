import { useState, useMemo, useEffect, useRef } from 'react';
import { useGameState } from './hooks/useGameState';
import { Card } from './components/Card';
import { DiscardPile } from './components/DiscardPile';
import { Opponents } from './components/Opponents';
import { getCardsLayout } from './lib/math';
import { GAME_CONFIG } from './lib/config';

type LocalCard = any & { zone: 'hand' | 'staging' };

export default function App() {
  const { name, setName, roomId, setRoomId, isConnected, gameState, lastError, connect, sendAction } = useGameState();
  
  const [localCards, setLocalCards] = useState<LocalCard[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('red');

  const me = gameState?.players.find((p: any) => p.name === name);
  const currentPlayer = gameState?.players[gameState?.current_turn_index];
  const isMyTurn = me?.id === currentPlayer?.id && me?.is_playing && gameState?.status === 'playing';
  const penaltyCards = gameState?.penalty_cards || 0;
  const needsToTakePenalty = isMyTurn && penaltyCards > 0;
  
  const [delayedStatus, setDelayedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.status === 'finished') {
      const timer = setTimeout(() => setDelayedStatus('finished'), GAME_CONFIG.FINISH_DELAY);
      return () => clearTimeout(timer);
    } else {
      setDelayedStatus(gameState.status);
    }
  }, [gameState?.status]);
  
  // --- СИНХРОНИЗАЦИЯ СОСТОЯНИЯ И ПАМЯТЬ АНИМАЦИЙ ---  
  useEffect(() => {
      const myPlayer = gameState?.players.find((p: any) => p.id === me?.id);
      if (!myPlayer) return;

      const serverHand = myPlayer.hand;

      setLocalCards(prevLocalCards => {
        // 1. Собираем ID карт, которые сейчас реально есть у нас на сервере
        const serverCardIds = new Set(serverHand.map((c: any) => c.id));

        // 2. Проходим по нашему локальному массиву (сохраняя пользовательский порядок!)
        const preservedCards = prevLocalCards
          .filter(localCard => serverCardIds.has(localCard.id)) // Удаляем сыгранные карты
          .map(localCard => {
            // Берем свежие данные с сервера (вдруг цвет у wild-карты поменялся), 
            // но ЗОНУ оставляем ту, которую выбрал игрок локально!
            const serverData = serverHand.find((c: any) => c.id === localCard.id);
            return { ...serverData, zone: localCard.zone };
          });

        // 3. Ищем совершенно новые карты (которых раньше не было в руках)
        const preservedCardIds = new Set(preservedCards.map(c => c.id));
        const newCards = serverHand
          .filter((c: any) => !preservedCardIds.has(c.id))
          .map((c: any) => ({ ...c, zone: 'hand' })); // Новые всегда летят в руку

        // Возвращаем объединенный массив
        return [...preservedCards, ...newCards];
      });
    }, [gameState?.players, me?.id]); // Зависимости обновления




  // --- ЛОГИКА DRAG & DROP И СОРТИРОВКИ ---

  const seenCards = useRef<Set<string>>(new Set());
  const [renderTick, setRenderTick] = useState(0);
  
  // --- ОЧИСТКА ПАМЯТИ
  useEffect(() => {
    const currentIds = new Set(localCards.map(c => c.id));
    for (const id of seenCards.current) {
      if (!currentIds.has(id)) {
        seenCards.current.delete(id);
      }
    }
  }, [localCards]);

// сортировка в реальном времени ---
  // --- сортировка и прицеливание между зонами ---
  const handleDrag = (e: any, info: any, cardId: string) => {
    const dropY = info.point.y;
    const dropX = info.point.x - (window.innerWidth / 2);

    // Определяем, над какой зоной сейчас находится курсор
    const canStage = isMyTurn && !needsToTakePenalty;
    const isStagingHover = dropY < window.innerHeight + GAME_CONFIG.STAGE_DROP_Y;
    const targetZone = (canStage && isStagingHover) ? 'staging' : 'hand';

    setLocalCards(prev => {
      const originalCard = prev.find(c => c.id === cardId);
      if (!originalCard) return prev;

      const isZoneChanged = originalCard.zone !== targetZone;

      // 1. ПЛАВНАЯ СОРТИРОВКА ВНУТРИ ОДНОЙ ЗОНЫ (Рука или Зона подготовки)
      if (!isZoneChanged) {
        const targetCards = prev.filter(c => c.zone === targetZone);
        const currentIndex = targetCards.findIndex(c => c.id === cardId);
        if (currentIndex === -1) return prev;

        const currentLayout = getCardsLayout(targetCards, targetZone);
        let newIndex = currentIndex;
        const SWAP_THRESHOLD = 15;

        // Сдвиг влево
        if (currentIndex > 0) {
          const leftNeighbor = currentLayout[currentIndex - 1];
          if (dropX < leftNeighbor.x + SWAP_THRESHOLD) newIndex = currentIndex - 1;
        }

        // Сдвиг вправо
        if (currentIndex < targetCards.length - 1) {
          const rightNeighbor = currentLayout[currentIndex + 1];
          if (dropX > rightNeighbor.x - SWAP_THRESHOLD) newIndex = currentIndex + 1;
        }

        if (newIndex !== currentIndex) {
          const movingCard = targetCards[currentIndex];
          const targetCardsCopy = [...targetCards];
          targetCardsCopy.splice(currentIndex, 1);
          targetCardsCopy.splice(newIndex, 0, movingCard);

          const otherCards = prev.filter(c => c.zone !== targetZone);
          return targetZone === 'hand' ? [...targetCardsCopy, ...otherCards] : [...otherCards, ...targetCardsCopy];
        }
        return prev;
      }

      // 2. ЕСЛИ ЗОНА ИЗМЕНИЛАСЬ (МЕЖЗОННОЕ ПРИЦЕЛИВАНИЕ)
      // Карта пересекла границу -> мгновенно перекидываем её в массив новой зоны!
      const movingCard = { ...originalCard, zone: targetZone };
      const newCards = prev.filter(c => c.id !== cardId);
      const targetCards = newCards.filter(c => c.zone === targetZone);
      const otherCards = newCards.filter(c => c.zone !== targetZone);

      // Ищем точное место для вставки (чтобы пустота открылась ровно под мышкой)
      const layout = getCardsLayout(targetCards, targetZone);
      let insertIdx = targetCards.length;
      for (let i = 0; i < layout.length; i++) {
        if (dropX < layout[i].x) {
          insertIdx = i;
          break;
        }
      }

      targetCards.splice(insertIdx, 0, movingCard);
      return targetZone === 'hand' ? [...targetCards, ...otherCards] : [...otherCards, ...targetCards];
    });
  };

  // --- окончание DRAG & DROP ---
 const handleDragEnd = (e: any, info: any, cardId: string) => {
    // Вся тяжелая работа уже сделана в handleDrag в реальном времени.
    // Просто отключаем режим "драга", чтобы Фреймер плавно довёл карту в её слот.
    setActiveCardId(null);
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

  if (!gameState) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center"><h2 className="text-2xl text-white font-bold animate-pulse">Синхронизация...</h2></div>;

  if (delayedStatus === 'waiting' || delayedStatus === 'finished') {
    const isFinished = delayedStatus === 'finished';
    const winner = isFinished ? gameState.players.find((p: any) => p.hand.length === 0 && p.is_playing) : null;
    const isHost = me?.is_host;
    const activePlayersCount = gameState.players.filter((p: any) => !p.wants_to_spectate).length;

    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
        <div className="w-full max-w-3xl bg-neutral-800 p-6 sm:p-10 rounded-3xl shadow-2xl">
          {/* ... ЛОББИ БЕЗ ИЗМЕНЕНИЙ ... */}
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

  const handCards = localCards.filter(c => c.zone === 'hand');
  const handLayout = getCardsLayout(handCards, 'hand');
  const stagingLayout = getCardsLayout(stagedCards, 'staging');

  // Вычисляем стартовые координаты для анимации Банка (относительно якоря "bottom-0 left-1/2")
  const bankStartY = -(window.innerHeight * ((100 - GAME_CONFIG.TABLE_CENTER_Y_VH) / 100));
  const bankStartX = GAME_CONFIG.BANK_OFFSET_X;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-teal-900 to-black text-white overflow-hidden">

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

      <Opponents players={gameState.players} meId={me?.id} currentTurnId={currentPlayer?.id} actionLog={gameState.action_log} />

      <div className="absolute left-1/2 w-full -translate-x-1/2 -translate-y-1/2 pointer-events-none flex justify-center items-center" style={{ top: `${GAME_CONFIG.TABLE_CENTER_Y_VH}vh` }}>
        <div className="relative pointer-events-auto z-20">
          <DiscardPile cards={gameState.discard_pile} declaredColor={gameState.declared_color} actionLog={gameState.action_log} meId={me?.id} players={gameState.players} />
        </div>
        <div 
          onClick={() => isMyTurn && !gameState.has_drawn_this_turn && !needsToTakePenalty && sendAction('draw_card')}
          className={`absolute left-1/2 bg-neutral-800 rounded-xl border-4 border-neutral-700 flex items-center justify-center shadow-2xl transition-all pointer-events-auto ${isMyTurn && !gameState.has_drawn_this_turn && !needsToTakePenalty ? 'cursor-pointer hover:scale-105 hover:-translate-y-2 border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.4)]' : 'opacity-80'}`}
          style={{ width: GAME_CONFIG.CARD_WIDTH, height: GAME_CONFIG.CARD_HEIGHT, marginLeft: GAME_CONFIG.BANK_OFFSET_X }}
        >
          <span className="text-neutral-500 font-black rotate-[-45deg] text-xl">UNO</span>
          <div className="absolute -bottom-5 text-xs text-white/70 bg-black/60 px-3 py-1 rounded-full border border-white/10 font-bold whitespace-nowrap">
            В колоде: {gameState.deck.length}
          </div>
        </div>
      </div>

      {/* КНОПКИ ЗАВЕРШЕНИЯ ХОДА И ШТРАФА 👇 */}
      {isMyTurn && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50 pointer-events-auto"
          style={{ bottom: GAME_CONFIG.STAGE_BOX_BOTTOM + GAME_CONFIG.STAGE_BOX_HEIGHT + 20 }} // Размещаем чуть выше рамки Зоны подготовки
        >
          {needsToTakePenalty && (
            <button 
              onClick={() => sendAction('take_penalty')} 
              className="px-10 py-5 bg-red-600 hover:bg-red-500 text-white font-black text-2xl rounded-full shadow-[0_0_50px_rgba(220,38,38,1)] transform hover:scale-110 transition-all border-4 border-white animate-pulse"
            >
              😱 ЗАБРАТЬ {penaltyCards} КАРТ(Ы)
            </button>
          )}
          {!needsToTakePenalty && gameState?.has_drawn_this_turn && stagedCards.length === 0 && (
            <button 
              onClick={() => sendAction('pass_turn')} 
              className="px-8 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-black text-xl rounded-full shadow-[0_0_30px_rgba(0,0,0,0.6)] transform hover:scale-105 transition-all border-2 border-neutral-400"
            >
              ⏭ ЗАКОНЧИТЬ ХОД
            </button>
          )}
        </div>
      )}

      {me.is_playing && (
        <div className="fixed bottom-0 left-1/2 w-0 h-0 pointer-events-none z-40">
          
          {(!needsToTakePenalty && isMyTurn) && (
            <div 
              className="absolute left-1/2 -translate-x-1/2 p-4 rounded-3xl border-4 border-dashed border-white/30 bg-black/20"
              style={{ bottom: GAME_CONFIG.STAGE_BOX_BOTTOM, width: GAME_CONFIG.STAGE_BOX_WIDTH, height: GAME_CONFIG.STAGE_BOX_HEIGHT }} 
            />
          )}

          {needsColor && stagedCards.length > 0 && !needsToTakePenalty && isMyTurn && (
            <div className="absolute left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-white/80 backdrop-blur rounded-full shadow-lg border pointer-events-auto" style={{ bottom: GAME_CONFIG.PALETTE_BOTTOM }}>
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

          {stagedCards.length > 0 && !needsToTakePenalty && isMyTurn && (
            <button 
              onClick={handlePlayCards}
              className="absolute left-1/2 -translate-x-1/2 px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-300 text-white font-black text-xl rounded-full shadow-[0_0_15px_rgba(192,38,211,0.5)] transform hover:scale-105 transition-all w-max pointer-events-auto"
              style={{ bottom: GAME_CONFIG.PLAY_BTN_BOTTOM }}
            >
              СЫГРАТЬ ({stagedCards.length})
            </button>
          )}

          {localCards.map(card => {
            const isHand = card.zone === 'hand';
            const layout = isHand ? handLayout.find(l => l.id === card.id)! : stagingLayout.find(l => l.id === card.id)!;
            const targetY = isHand ? GAME_CONFIG.HAND_Y_POS - layout.y : GAME_CONFIG.STAGE_ZONE_Y;
            

            // Разделяем логику полета, перетаскивания и покоя
            const isDragging = activeCardId === card.id;
            const isNew = !seenCards.current.has(card.id);

            let animateProps;

            if (isDragging) {
              // ТАЩИМ: убираем координаты, чтобы мышка управляла картой
              animateProps = {
                scale: 1.05,
                rotate: 0,
                opacity: 1,
                zIndex: 100
              };
            } else if (isNew) {
              // НОВАЯ: летит из банка (Keyframes)
              animateProps = {
                x: [bankStartX, layout.x],
                y: [bankStartY, targetY],
                scale: [0.5, 1],
                rotate: [-45, layout.rotate],
                opacity: [0, 1],
                zIndex: layout.zIndex + (isHand ? 0 : 50)
              };
            } else {
              // ОБЫЧНАЯ: статичные координаты слота
              animateProps = {
                x: layout.x,
                y: targetY,
                scale: 1,
                rotate: layout.rotate,
                opacity: 1,
                zIndex: layout.zIndex + (isHand ? 0 : 50)
              };
            }

            return (
              <Card
                key={card.id}
                card={card}
                
                // 1. МАГИЯ CSS: Если карта летит (isNew), она буквально "прозрачна" для мыши
                className={isNew ? "pointer-events-none" : "pointer-events-auto"}
                
                onDragStart={() => {
                  setActiveCardId(card.id);
                  if (isNew) {
                    seenCards.current.add(card.id);
                    setRenderTick(t => t + 1);
                  }
                }}
                onDrag={(e, info) => handleDrag(e, info, card.id)}
                onDragEnd={(e, info) => handleDragEnd(e, info, card.id)}
                
                onAnimationComplete={() => {
                  if (isNew) {
                    seenCards.current.add(card.id);
                    setRenderTick(t => t + 1);
                  }
                }}

                animate={animateProps}
                
                // 2. Добавляем !isNew в условие hover-анимации для 100% надежности
                whileHover={isHand && !isDragging && !isNew ? { y: targetY - GAME_CONFIG.CARD_HOVER_OFFSET, rotate: layout.rotate } : {}}
                
                transition={GAME_CONFIG.TRANSITIONS.UI}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
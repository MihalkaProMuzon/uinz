import { useState, useRef, useEffect } from 'react'

export default function App() {
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [gameState, setGameState] = useState<any>(null)
  const [selectedCards, setSelectedCards] = useState<string[]>([])
  
  const ws = useRef<WebSocket | null>(null)

  const connect = () => {
    if (!name || !roomId) return
    const host = window.location.hostname;
    ws.current = new WebSocket(`ws://${host}:8000/ws/${roomId}/${name}`)
    ws.current.onopen = () => setIsConnected(true)
    ws.current.onmessage = (event) => setGameState(JSON.parse(event.data))
    ws.current.onclose = () => setIsConnected(false)
  }

  useEffect(() => { setSelectedCards([]) }, [gameState?.current_turn_index])

  const toggleCardSelection = (cardId: string) => {
    if (selectedCards.includes(cardId)) {
      setSelectedCards(selectedCards.filter(id => id !== cardId))
    } else {
      setSelectedCards([...selectedCards, cardId])
    }
  }

  // НОВОЕ: Отправка карт с учетом цвета
  const playSelectedCards = (color?: string) => {
    if (selectedCards.length === 0) return
    ws.current?.send(JSON.stringify({ 
      action: 'play_cards', 
      card_ids: selectedCards,
      declared_color: color 
    }))
  }

  const drawCard = () => ws.current?.send(JSON.stringify({ action: 'draw_card' }))
  const passTurn = () => ws.current?.send(JSON.stringify({ action: 'pass_turn' }))
  const takePenalty = () => ws.current?.send(JSON.stringify({ action: 'take_penalty' }))

  if (!isConnected) {
    return (
      <div style={{ padding: 20 }}>
        <h1>UNO Прототип</h1>
        <input placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Комната" value={roomId} onChange={e => setRoomId(e.target.value)} />
        <button onClick={connect}>Войти</button>
      </div>
    )
  }

  if (!gameState) {
    return <h2>Синхронизация с сервером...</h2>
  }

  if (gameState?.status === 'waiting') return <h2>Ждем второго игрока...</h2>

  // --- ЭКРАН ПОБЕДЫ ---
  if (gameState?.status === 'finished') {
    const winner = gameState.players.find((p:any) => p.hand.length === 0)
    return (
      <div style={{ padding: 50, textAlign: 'center', backgroundColor: '#ffd700' }}>
        <h1>🎉 ИГРА ОКОНЧЕНА 🎉</h1>
        <h2>Победитель: {winner?.name}!</h2>
        <button onClick={() => window.location.reload()}>Играть снова</button>
      </div>
    )
  }

  const me = gameState?.players.find((p: any) => p.name === name)
  const currentPlayer = gameState?.players[gameState.current_turn_index]
  const isMyTurn = me?.id === currentPlayer?.id
  const topCard = gameState?.discard_pile[gameState.discard_pile.length - 1]
  const hasDrawn = gameState?.has_drawn_this_turn
  const penaltyCards = gameState?.penalty_cards || 0
  const declaredColor = gameState?.declared_color

  // Проверяем, нужна ли палитра цветов (если последняя выбранная карта - черная)
  const lastSelectedCardId = selectedCards[selectedCards.length - 1]
  const lastSelectedCard = me?.hand.find((c: any) => c.id === lastSelectedCardId)
  const needsColorSelection = lastSelectedCard?.color === 'black'

  const getCardStyle = (card: any, isSelected: boolean) => ({
    backgroundColor: card.color === 'black' ? '#333' : card.color,
    color: card.color === 'yellow' ? 'black' : 'white',
    padding: '15px 10px',
    border: isSelected ? '4px solid #ff00ff' : '2px solid black',
    borderRadius: '8px',
    cursor: isMyTurn ? 'pointer' : 'not-allowed',
    opacity: isMyTurn ? 1 : 0.6,
    minWidth: '80px', textAlign: 'center' as const, position: 'relative' as const,
    transform: isSelected ? 'translateY(-10px)' : 'none'
  })

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Комната: {roomId} {gameState.direction === -1 ? '🔄 (Против часовой)' : '🔃 (По часовой)'}</h1>
      
      <h2 style={{ padding: 10, backgroundColor: isMyTurn ? '#d4edda' : '#251f20', color: isMyTurn ? '#155724' : '#721c24' }}>
        {isMyTurn ? '🔥 ТВОЙ ХОД!' : `⏳ Ходит: ${currentPlayer?.name}`}
      </h2>
      
      {/* ЕСЛИ ВИСИТ ШТРАФ - ПРЕДУПРЕЖДАЕМ ВСЕХ */}
      {penaltyCards > 0 && (
        <h2 style={{ color: 'red', animation: 'blink 1s infinite' }}>
          ⚠️ Ожидание: {currentPlayer?.name} должен взять {penaltyCards} карт!
        </h2>
      )}

      <div style={{ border: '2px solid black', padding: 20, marginBottom: 20, backgroundColor: '#3e3e3e' }}>
        <h3>СБРОС:</h3>
        {topCard ? (
          <div style={getCardStyle(topCard, false)}>
            <b>{topCard.card_type.toUpperCase()}</b><br/>
            <span style={{ fontSize: '24px' }}>{topCard.value ?? '★'}</span>
            {/* ПОКАЗЫВАЕМ ЗАКАЗАННЫЙ ЦВЕТ, ЕСЛИ КАРТА ЧЕРНАЯ */}
            {declaredColor && topCard.color === 'black' && (
              <div style={{ marginTop: 10, padding: 5, backgroundColor: declaredColor, color: declaredColor === 'yellow' ? 'black' : 'white', fontSize: 12 }}>
                Заказан: {declaredColor}
              </div>
            )}
          </div>
        ) : 'Пусто'}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3>Игроки:</h3>
        {gameState?.players.map((p: any) => (
          <div key={p.id}>
             {p.id === currentPlayer.id ? '👉 ' : '   '} 
             <b>{p.name}</b> (Карт: {p.hand.length})
          </div>
        ))}
      </div>

      <div style={{ padding: 20, border: '2px dashed #007bff', backgroundColor: '#232323' }}>
        <h3>ТВОЯ РУКА:</h3>
        
        <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
          {/* СЦЕНАРИЙ 1: На тебя напали, надо брать штраф */}
          {isMyTurn && penaltyCards > 0 && (
            <button onClick={takePenalty} style={{ padding: '15px 30px', background: '#dc3545', color: 'white', fontWeight: 'bold', fontSize: '18px' }}>
              😱 Забрать {penaltyCards} карт и пропустить ход
            </button>
          )}

          {/* СЦЕНАРИЙ 2: Обычный ход (нет штрафа) */}
          {isMyTurn && penaltyCards === 0 && (
            <>
              {!hasDrawn && <button onClick={drawCard} style={{ padding: '10px 20px', background: '#ffc107', fontWeight: 'bold' }}>📥 Взять карту</button>}
              {hasDrawn && <button onClick={passTurn} style={{ padding: '10px 20px', background: '#6c757d', color: 'white' }}>⏭ Закончить ход</button>}
              
              {selectedCards.length > 0 && !needsColorSelection && (
                <button onClick={() => playSelectedCards()} style={{ padding: '10px 20px', background: '#28a745', color: 'white' }}>🚀 Сыграть ({selectedCards.length})</button>
              )}

              {/* СЦЕНАРИЙ 3: Выбрана черная карта -> показываем кнопки выбора цвета */}
              {selectedCards.length > 0 && needsColorSelection && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', border: '2px solid black', padding: 5 }}>
                  <span>Выберите цвет:</span>
                  <button onClick={() => playSelectedCards('red')} style={{ background: 'red', color: 'white', padding: 10 }}>Красный</button>
                  <button onClick={() => playSelectedCards('green')} style={{ background: 'green', color: 'white', padding: 10 }}>Зеленый</button>
                  <button onClick={() => playSelectedCards('blue')} style={{ background: 'blue', color: 'white', padding: 10 }}>Синий</button>
                  <button onClick={() => playSelectedCards('yellow')} style={{ background: 'yellow', padding: 10 }}>Желтый</button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {me?.hand.map((card: any) => {
            const isSelected = selectedCards.includes(card.id)
            const selectedIndex = selectedCards.indexOf(card.id) + 1
            return (
              <div key={card.id} onClick={() => isMyTurn && toggleCardSelection(card.id)} style={getCardStyle(card, isSelected)}>
                {isSelected && <div style={{ position: 'absolute', top: -10, right: -10, background: 'magenta', color: 'white', borderRadius: '50%', width: 20, height: 20, fontSize: 12, lineHeight: '20px' }}>{selectedIndex}</div>}
                <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>{card.color}</div>
                <b>{card.card_type}</b><br/>
                <span style={{ fontSize: '20px' }}>{card.value ?? '★'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
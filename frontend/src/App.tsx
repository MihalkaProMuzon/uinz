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
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.action === 'error') {
        alert("❌ ОШИБКА: " + data.message) // алерты
        return
      }
      setGameState(data)
    }
    ws.current.onclose = () => setIsConnected(false)
  }

  useEffect(() => { setSelectedCards([]) }, [gameState?.current_turn_index])

  // --- Отправка сокетов ---
  const send = (action: string, payload: any = {}) => {
    ws.current?.send(JSON.stringify({ action, ...payload }))
  }

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId])
  }

  const playSelectedCards = (color?: string) => {
    if (selectedCards.length === 0) return
    send('play_cards', { card_ids: selectedCards, declared_color: color })
    setSelectedCards([])
  }

  // --- Рендер ---
  if (!isConnected) {
    return (
      <div style={{ padding: 20 }}>
        <h1>UNO: Лобби</h1>
        <input placeholder="Твое имя" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Имя комнаты" value={roomId} onChange={e => setRoomId(e.target.value)} />
        <button onClick={connect}>Войти</button>
      </div>
    )
  }

  if (!gameState) return <h2>Синхронизация...</h2>

  const me = gameState.players.find((p: any) => p.name === name)
  const isHost = me?.is_host

  // ==========================================
  // ЭКРАН 1: ЛОББИ ОЖИДАНИЯ
  // ==========================================
  if (gameState.status === 'waiting') {
    const activePlayersCount = gameState.players.filter((p:any) => !p.wants_to_spectate).length

    return (
      <div style={{ padding: 20 }}>
        <h1>Комната: {roomId} | Подготовка</h1>
        
        <div style={{ padding: 20, border: '2px solid black', marginBottom: 20, backgroundColor: '#f9f9f9' }}>
          <h3>Игроки в комнате:</h3>
          <ul>
            {gameState.players.map((p: any) => (
              <li key={p.id} style={{ marginBottom: 10 }}>
                {p.is_host ? '👑 ' : ''}
                {p.wants_to_spectate ? '(Зритель)' : '🎮'} 
                <b> {p.name} </b> 
                [Побед: {p.wins}]
                
                {/* Хост может передать корону */}
                {isHost && p.id !== me.id && (
                  <button onClick={() => send('transfer_host', { target_id: p.id })} style={{ marginLeft: 10, fontSize: 12 }}>
                    Передать Хоста
                  </button>
                )}
              </li>
            ))}
          </ul>
          
          <button onClick={() => send('toggle_spectator')} style={{ padding: '10px', background: '#17a2b8', color: 'white' }}>
            {me.wants_to_spectate ? 'Стать игроком' : 'Стать зрителем'}
          </button>
        </div>

        {/* ПАНЕЛЬ ХОСТА */}
        {isHost && (
          <div style={{ padding: 20, border: '2px dashed red', backgroundColor: '#fff3f3' }}>
            <h3>Панель Хоста</h3>
            {activePlayersCount < 2 ? (
              <p style={{ color: 'red' }}>чтобы начать, нужно минимум 2 игрока</p>
            ) : (
              <button onClick={() => send('start_game')} style={{ padding: '15px', background: '#28a745', color: 'white', fontSize: 18 }}>
                Запустить игру!
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ==========================================
  // ЭКРАН 2: ОКОНЧАНИЕ ИГРЫ
  // ==========================================
  if (gameState.status === 'finished') {
    const winner = gameState.players.find((p:any) => p.hand.length === 0 && p.is_playing)
    return (
      <div style={{ padding: 50, textAlign: 'center', backgroundColor: '#ffd700' }}>
        <h1>🎉 ИГРА ОКОНЧЕНА 🎉</h1>
        <h2>Победитель: {winner?.name}!</h2>
        <p>Счет побед: {winner?.wins}</p>
        
        {isHost ? (
          <button onClick={() => send('reset_lobby')} style={{ padding: 15, background: 'black', color: 'white', fontSize: 18 }}>
            Вернуться в Лобби (Пересоздать)
          </button>
        ) : (
          <p>Ожидаем, пока хост пересоздаст игру...</p>
        )}
      </div>
    )
  }

  // ==========================================
  // ЭКРАН 3: САМА ИГРА
  // ==========================================
  const currentPlayer = gameState.players[gameState.current_turn_index]
  const isMyTurn = me?.id === currentPlayer?.id && me.is_playing
  const topCard = gameState.discard_pile[gameState.discard_pile.length - 1]
  const penaltyCards = gameState.penalty_cards || 0
  const declaredColor = gameState.declared_color
  const needsColorSelection = me?.hand.find((c: any) => c.id === selectedCards[selectedCards.length - 1])?.color === 'black'

  const getCardStyle = (card: any, isSelected: boolean) => ({
    backgroundColor: card.color === 'black' ? '#333' : card.color, color: card.color === 'yellow' ? 'black' : 'white',
    padding: '15px 10px', border: isSelected ? '4px solid #ff00ff' : '2px solid black', borderRadius: '8px',
    cursor: isMyTurn ? 'pointer' : 'not-allowed', opacity: isMyTurn ? 1 : 0.6,
    minWidth: '80px', textAlign: 'center' as const, position: 'relative' as const,
    transform: isSelected ? 'translateY(-10px)' : 'none'
  })

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Комната: {roomId} {gameState.direction === -1 ? '🔄' : '🔃'}</h1>
        <button onClick={() => send('toggle_spectator')} style={{ background: '#eee', border: '1px solid black', padding: 5 }}>
          {me.wants_to_spectate ? '❌ Отменить зрителя (на след. игру)' : '👁️ Стать зрителем (на след. игру)'}
        </button>
      </div>
      
      {!me.is_playing ? (
        <h2 style={{ background: '#6c757d', color: 'white', padding: 10 }}>Вы смотрите игру (Зритель)</h2>
      ) : (
        <h2 style={{ padding: 10, backgroundColor: isMyTurn ? '#d4edda' : '#f8d7da', color: isMyTurn ? '#155724' : '#721c24' }}>
          {isMyTurn ? '🔥 ТВОЙ ХОД!' : `⏳ Ходит: ${currentPlayer?.name}`}
        </h2>
      )}

      {penaltyCards > 0 && <h2 style={{ color: 'red' }}>⚠️ Ожидание: {currentPlayer?.name} берет {penaltyCards} карт!</h2>}

      <div style={{ border: '2px solid black', padding: 20, marginBottom: 20, backgroundColor: '#eee' }}>
        <h3>СБРОС (В колоде: {gameState.deck.length}):</h3>
        {topCard ? (
          <div style={getCardStyle(topCard, false)}>
            <b>{topCard.card_type.toUpperCase()}</b><br/><span style={{ fontSize: '24px' }}>{topCard.value ?? '★'}</span>
            {declaredColor && topCard.color === 'black' && <div style={{ marginTop: 10, background: declaredColor, color: declaredColor === 'yellow'?'black':'white', fontSize: 12 }}>Заказан: {declaredColor}</div>}
          </div>
        ) : 'Пусто'}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3>Список участников:</h3>
        {gameState.players.map((p: any) => (
          <div key={p.id} style={{ opacity: p.is_playing ? 1 : 0.4 }}>
             {p.id === currentPlayer?.id && p.is_playing ? '👉 ' : '   '} 
             {p.is_host ? '👑 ' : ''}
             <b>{p.name}</b> {p.is_playing ? `(Карт: ${p.hand.length})` : '(Зритель)'} [🏆 {p.wins}]
          </div>
        ))}
      </div>

      {me.is_playing && (
        <div style={{ padding: 20, border: '2px dashed #007bff', backgroundColor: '#f8f9fa' }}>
          <h3>ТВОЯ РУКА:</h3>
          <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
            {isMyTurn && penaltyCards > 0 && (
              <button onClick={() => send('take_penalty')} style={{ padding: '15px', background: '#dc3545', color: 'white' }}>😱 Забрать {penaltyCards} карт</button>
            )}
            {isMyTurn && penaltyCards === 0 && (
              <>
                {!gameState.has_drawn_this_turn && <button onClick={() => send('draw_card')} style={{ padding: '10px', background: '#ffc107' }}>📥 Взять карту</button>}
                {gameState.has_drawn_this_turn && <button onClick={() => send('pass_turn')} style={{ padding: '10px', background: '#6c757d', color: 'white' }}>⏭ Закончить</button>}
                {selectedCards.length > 0 && !needsColorSelection && <button onClick={() => playSelectedCards()} style={{ padding: '10px', background: '#28a745', color: 'white' }}>🚀 Сыграть ({selectedCards.length})</button>}
                {selectedCards.length > 0 && needsColorSelection && (
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['red', 'green', 'blue', 'yellow'].map(c => (
                      <button key={c} onClick={() => playSelectedCards(c)} style={{ background: c, color: c==='yellow'?'black':'white', padding: 10 }}>{c}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {me.hand.map((card: any) => {
              const isSelected = selectedCards.includes(card.id)
              return (
                <div key={card.id} onClick={() => isMyTurn && toggleCardSelection(card.id)} style={getCardStyle(card, isSelected)}>
                  {isSelected && <div style={{ position: 'absolute', top:-10, right:-10, background:'magenta', color:'white', borderRadius:'50%', width:20, height:20, fontSize:12}}>{selectedCards.indexOf(card.id)+1}</div>}
                  <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>{card.color}</div>
                  <b>{card.card_type}</b><br/><span style={{ fontSize: '20px' }}>{card.value ?? '★'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
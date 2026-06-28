import { useState, useCallback, useRef } from 'react';

export function useGameState() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<any>(null);
  const [lastError, setLastError] = useState<number>(0);
  
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback((playerName: string, room: string) => {
    if (!playerName || !room) return;
    setName(playerName);
    setRoomId(room);
    const host = window.location.hostname;
    ws.current = new WebSocket(`ws://${host}:8000/ws/${room}/${playerName}`);
    
    ws.current.onopen = () => setIsConnected(true);
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.action === 'error') {
        alert("❌ ОШИБКА: " + data.message);
        setLastError(Date.now());
        return;
      }
      setGameState(data);
    };
    
    ws.current.onclose = (event) => {
      setIsConnected(false);
      // Ловим нашу кастомную ошибку 1008
      if (event.code === 1008) {
        alert("❌ " + (event.reason || "Имя уже занято!"));
        setName(''); // Очищаем имя, чтобы игрок ввел новое
      }
    };
  }, []);

  const sendAction = useCallback((action: string, payload: any = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action, ...payload }));
    }
  }, []);

  return {
    name, setName, roomId, setRoomId, isConnected, gameState, 
    lastError, connect, sendAction
  };
}
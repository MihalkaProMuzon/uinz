from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
from game.models import GameRoom, Player
import json

app = FastAPI()

class RoomManager:
    def __init__(self):
        # Храним данные комнат: {"room_1": GameRoom(...)}
        self.rooms: Dict[str, GameRoom] = {}
        # Храним сами вебсокеты: {"room_1": [ws1, ws2]}
        self.connections: Dict[str, List[WebSocket]] = {}

    def get_or_create_room(self, room_id: str) -> GameRoom:
        if room_id not in self.rooms:
            self.rooms[room_id] = GameRoom(room_id=room_id)
            self.connections[room_id] = []
        return self.rooms[room_id]

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.connections:
            self.connections[room_id] = []
        self.connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.connections:
            self.connections[room_id].remove(websocket)

    async def broadcast(self, room_id: str):
        """Отправляет актуальное состояние комнаты всем игрокам в ней"""
        room = self.rooms.get(room_id)
        if not room:
            return
        
        # Pydantic сам превращает всю нашу сложную комнату в JSON-строку!
        state_json = room.model_dump_json()
        
        for connection in self.connections.get(room_id, []):
            await connection.send_text(state_json)

manager = RoomManager()

@app.websocket("/ws/{room_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_name: str):
    room = manager.get_or_create_room(room_id)
    await manager.connect(websocket, room_id)
    
    # Для простоты пока используем id вебсокета как id игрока
    player_id = str(id(websocket))
    player = Player(id=player_id, name=player_name)
    room.players.append(player)
    
    # ПРАВИЛО ПРОТОТИПА: Как только набирается 2 человека - стартуем игру автоматически
    if len(room.players) == 2 and room.status == "waiting":
        room.start_game()
        
    # Рассылаем всем обновленный статус комнаты
    await manager.broadcast(room_id)
    

    # Общение с игроками
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            action = message.get("action")
            
            try:
                if action == "play_cards":
                    card_ids = message.get("card_ids")
                    declared_color = message.get("declared_color") # Получаем загаданный цвет
                    room.play_cards(player_id, card_ids, declared_color)
                elif action == "take_penalty":
                    room.take_penalty(player_id)
                elif action == "draw_card":
                    room.draw_card(player_id)
                elif action == "pass_turn":
                    room.pass_turn(player_id)
                    
            except ValueError as e:
                print(f"Ошибка у {player_name}: {e}")
                continue 
                
            await manager.broadcast(room_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        # Если игрок отвалился, удаляем его из комнаты
        room.players = [p for p in room.players if p.id != player_id]
        await manager.broadcast(room_id)
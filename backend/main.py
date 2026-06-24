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

# (Импорты и RoomManager оставь как были)

@app.websocket("/ws/{room_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_name: str):
    room = manager.get_or_create_room(room_id)
    await manager.connect(websocket, room_id)
    
    player_id = str(id(websocket))
    
    # НОВОЕ: Первый вошедший становится хостом
    is_host = len(room.players) == 0
    player = Player(id=player_id, name=player_name, is_host=is_host)
    
    # НОВОЕ: Если зашел во время игры - насильно становится зрителем
    if room.status != "waiting":
        player.wants_to_spectate = True
        player.is_playing = False
        
    room.players.append(player)
    await manager.broadcast(room_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            action = message.get("action")
            
            try:
                if action == "play_cards": room.play_cards(player_id, message.get("card_ids"), message.get("declared_color"))
                elif action == "take_penalty": room.take_penalty(player_id)
                elif action == "draw_card": room.draw_card(player_id)
                elif action == "pass_turn": room.pass_turn(player_id)
                elif action == "start_game": room.start_game(player_id)
                elif action == "reset_lobby": room.reset_to_lobby(player_id)
                elif action == "toggle_spectator": room.toggle_spectator(player_id)
                elif action == "transfer_host": room.transfer_host(player_id, message.get("target_id"))
                    
            except ValueError as e:
                print(f"Ошибка у {player_name}: {e}")
                # НОВОЕ: Шлем ошибку лично нарушителю, чтобы он знал, что не так!
                await websocket.send_text(json.dumps({"action": "error", "message": str(e)}))
                continue 
                
            await manager.broadcast(room_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        
        # НОВОЕ: Ищем игрока перед удалением, чтобы передать хоста
        leaving_player = next((p for p in room.players if p.id == player_id), None)
        was_host = leaving_player.is_host if leaving_player else False
        
        # Умное удаление
        room.remove_player(player_id)
        
        # Передаем хоста, если он вышел и кто-то остался
        if was_host and len(room.players) > 0:
            room.players[0].is_host = True
            
        await manager.broadcast(room_id)
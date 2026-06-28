import random
import uuid
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
import time


class ActionType(str, Enum):
    PLAY = "play"
    TAKE_CARDS = "take_cards" 

class Color(str, Enum):
    RED = "red"
    GREEN = "green"
    BLUE = "blue"
    YELLOW = "yellow"
    BLACK = "black"

class CardType(str, Enum):
    NUMBER = "number"
    SKIP = "skip"
    REVERSE = "reverse"
    DRAW_TWO = "draw_two"
    WILD = "wild"
    WILD_DRAW_FOUR = "wild_draw_four"

class Card(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    color: Color
    card_type: CardType
    value: Optional[int] = None


class GameAction(BaseModel):
    action_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_id: str
    type: ActionType
    cards: List[Card] = []
    count: int = 0
    timestamp: float = Field(default_factory=time.time)


class Player(BaseModel):
    id: str
    name: str
    hand: List[Card] = []
    is_host: bool = False
    wants_to_spectate: bool = False # Желание быть зрителем (можно менять когда угодно)
    is_playing: bool = False        # Участвует ли физически в текущем раунде
    wins: int = 0                   # Счетчик побед

class GameStatus(str, Enum):
    WAITING = "waiting" # Лобби
    PLAYING = "playing" # Игра
    FINISHED = "finished" # Экран победы

class GameRoom(BaseModel):
    room_id: str
    players: List[Player] = []
    status: GameStatus = GameStatus.WAITING
    deck: List[Card] = []
    discard_pile: List[Card] = []
    current_turn_index: int = 0
    direction: int = 1
    has_drawn_this_turn: bool = False 
    penalty_cards: int = 0
    declared_color: Optional[Color] = None
    action_log: List[GameAction] = []

    def _generate_deck(self):
        new_deck = []
        basic_colors = [Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW]
        for color in basic_colors:
            new_deck.append(Card(color=color, card_type=CardType.NUMBER, value=0))
            for value in range(1, 10):
                new_deck.append(Card(color=color, card_type=CardType.NUMBER, value=value))
                new_deck.append(Card(color=color, card_type=CardType.NUMBER, value=value))
            for c_type in [CardType.SKIP, CardType.REVERSE, CardType.DRAW_TWO]:
                new_deck.append(Card(color=color, card_type=c_type))
                new_deck.append(Card(color=color, card_type=c_type))
        for _ in range(4):
            new_deck.append(Card(color=Color.BLACK, card_type=CardType.WILD))
            new_deck.append(Card(color=Color.BLACK, card_type=CardType.WILD_DRAW_FOUR))
        self.deck = new_deck

    def _ensure_deck(self, needed_cards: int):
        """ПЕРЕМЕШИВАНИЕ: Если колода пуста, берем сброс (кроме верхней карты), тасуем и делаем колодой"""
        if len(self.deck) >= needed_cards:
            return
            
        if len(self.discard_pile) <= 1:
            return # Физически нет карт (все на руках)
            
        top_card = self.discard_pile.pop() # Сохраняем карту на столе
        self.deck.extend(self.discard_pile) # Забираем остальной сброс
        self.discard_pile = [top_card] # Возвращаем карту на стол
        random.shuffle(self.deck) # Тасуем!

    def start_game(self, initiator_id: str):
        """Хост запускает игру"""
        host = next((p for p in self.players if p.id == initiator_id), None)
        if not host or not host.is_host:
            raise ValueError("Только хост может запустить игру")

        # Определяем, кто будет играть
        active_count = 0
        for p in self.players:
            p.hand = [] # Очищаем руки
            if not p.wants_to_spectate:
                p.is_playing = True
                active_count += 1
            else:
                p.is_playing = False

        if active_count < 2:
            raise ValueError("Для игры нужно минимум 2 игрока (не наблюдателя)")

        self._generate_deck()
        random.shuffle(self.deck)
        
        # Раздаем по 7 карт только АКТИВНЫМ игрокам
        for p in self.players:
            if p.is_playing:
                p.hand = [self.deck.pop() for _ in range(7)]
                
        self.discard_pile = [self.deck.pop()]
        self.status = GameStatus.PLAYING
        self.has_drawn_this_turn = False
        self.penalty_cards = 0
        self.declared_color = None
        
        # Устанавливаем ход на первого активного игрока
        active_players = [p for p in self.players if p.is_playing]
        first_player = random.choice(active_players)
        
        self.current_turn_index = self.players.index(first_player)
        self.direction = 1

    def reset_to_lobby(self, initiator_id: str):
        """Возврат в лобби после окончания игры"""
        host = next((p for p in self.players if p.id == initiator_id), None)
        if not host or not host.is_host: raise ValueError("Только хост может")
        self.status = GameStatus.WAITING

    def can_play_card(self, card: Card) -> bool:
        if not self.discard_pile: return False
        top_card = self.discard_pile[-1]
        if self.declared_color:
            if card.color == Color.BLACK: return True
            if card.color == self.declared_color: return True
            if card.card_type != CardType.NUMBER and card.card_type == top_card.card_type: return True
            return False
        if card.color == Color.BLACK or top_card.color == Color.BLACK: return True
        if card.color == top_card.color: return True
        if card.card_type != CardType.NUMBER and card.card_type == top_card.card_type: return True
        if card.card_type == CardType.NUMBER and card.value == top_card.value: return True
        return False

    def add_action(self, player_id: str, act_type: ActionType, cards: Optional[List[Card]] = None, count: int = 0):
        """Добавляет действие в лог (храним только последние 10)"""
        if cards is None:
            cards = []
        self.action_log.append(GameAction(player_id=player_id, type=act_type, cards=cards, count=count))
        if len(self.action_log) > 10:
            self.action_log.pop(0)

    def get_sanitized_state(self, viewer_id: str) -> dict:
        """ Отдает состояние игры, скрывая карты других игроков"""
        state = self.model_dump()
        for p in state['players']:
            if p['id'] != viewer_id:
                # Вместо реальных карт отдаем "пустышки" с фейковыми ID, чтобы фронт мог их нарисовать рубашкой вверх
                p['hand'] = [{'id': f"hidden_{i}", 'color': 'hidden', 'card_type': 'hidden'} for i in range(len(p['hand']))]
        return state


    def next_turn(self):
        """Передача хода, ПРОПУСКАЯ наблюдателей"""
        while True:
            self.current_turn_index = (self.current_turn_index + self.direction) % len(self.players)
            if self.players[self.current_turn_index].is_playing:
                break
        self.has_drawn_this_turn = False

    def play_cards(self, player_id: str, card_ids: List[str], declared_color: Optional[Color] = None):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Сейчас не твой ход!")
        if self.penalty_cards > 0: raise ValueError("Прими штраф!")
        if not card_ids: raise ValueError("Не выбрано карт!")

        cards_to_play = []
        for cid in card_ids:
            c = next((x for x in current_player.hand if x.id == cid), None)
            if not c: raise ValueError("Карта не найдена!")
            cards_to_play.append(c)

        if not self.can_play_card(cards_to_play[0]): raise ValueError("Не подходит к сбросу!")
        for i in range(1, len(cards_to_play)):
            p, c = cards_to_play[i-1], cards_to_play[i]
            if c.card_type == CardType.NUMBER and p.card_type == CardType.NUMBER:
                if c.value != p.value: raise ValueError("Одинаковые цифры!")
            elif c.card_type != CardType.NUMBER and p.card_type != CardType.NUMBER:
                # Можно стакать любые черные карты
                if c.color == Color.BLACK and p.color == Color.BLACK:
                    pass
                elif c.card_type != p.card_type: 
                    raise ValueError("Можно класть только одинаковые спец-карты!")
            else: raise ValueError("Не смешивать!")

        last_card = cards_to_play[-1]
        if last_card.color == Color.BLACK:
            if not declared_color: raise ValueError("Выбери цвет!")
            self.declared_color = declared_color
        else:
            self.declared_color = None

        for c in cards_to_play:
            if c.card_type == CardType.DRAW_TWO: self.penalty_cards += 2
            if c.card_type == CardType.WILD_DRAW_FOUR: self.penalty_cards += 4

        for c in cards_to_play:
            current_player.hand.remove(c)
            self.discard_pile.append(c)

        self.add_action(player_id, ActionType.PLAY, cards_to_play.copy())


        # СИСТЕМА ПОБЕД
        if len(current_player.hand) == 0:
            current_player.wins += 1 # Даем очко
            self.status = GameStatus.FINISHED
            return

        if last_card.card_type == CardType.REVERSE:
            self.direction *= -1
            active_players = sum(1 for p in self.players if p.is_playing)
            if active_players == 2: self.next_turn() 
            
        if last_card.card_type == CardType.SKIP: self.next_turn()
        self.next_turn()

    def take_penalty(self, player_id: str):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Не твой ход!")
        if self.penalty_cards == 0: raise ValueError("Нет штрафа!")

        self._ensure_deck(self.penalty_cards) # Пробуем перемешать колоду
        for _ in range(self.penalty_cards):
            if self.deck: current_player.hand.append(self.deck.pop())
        
        self.add_action(player_id, ActionType.TAKE_CARDS, cards=None, count=self.penalty_cards)
        
        self.penalty_cards = 0
        self.next_turn()

    def draw_card(self, player_id: str):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Не твой ход!")
        if self.has_drawn_this_turn: raise ValueError("Уже брал!")
        if self.penalty_cards > 0: raise ValueError("Возьми штраф!")
        
        self._ensure_deck(1) # Пробуем перемешать колоду
        if self.deck: current_player.hand.append(self.deck.pop())
        self.has_drawn_this_turn = True

        self.add_action(player_id, ActionType.TAKE_CARDS, cards=None, count=1)
        

    def pass_turn(self, player_id: str):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Не твой ход!")
        if not self.has_drawn_this_turn: raise ValueError("Надо взять карту!")
        self.next_turn()
        
    def toggle_spectator(self, player_id: str):
        p = next((x for x in self.players if x.id == player_id), None)
        if p: p.wants_to_spectate = not p.wants_to_spectate

    def transfer_host(self, current_host_id: str, new_host_id: str):
        current = next((p for p in self.players if p.id == current_host_id), None)
        target = next((p for p in self.players if p.id == new_host_id), None)
        if current and current.is_host and target:
            current.is_host = False
            target.is_host = True

    def remove_player(self, player_id: str):
        """Умное удаление игрока с обработкой хода и остановкой игры"""
        idx = next((i for i, p in enumerate(self.players) if p.id == player_id), None)
        if idx is None: return
        
        p = self.players[idx]
        was_playing = p.is_playing
        is_current_turn = (self.status == GameStatus.PLAYING and self.current_turn_index == idx)
        
        # Если он играл - возвращаем его карты в колоду и тасуем
        if was_playing and p.hand:
            self.deck.extend(p.hand)
            import random
            random.shuffle(self.deck)
            
        self.players.pop(idx) # Удаляем физически
        
        # Если игра не идет, больше делать нечего
        if self.status != GameStatus.PLAYING: return
        
        # Проверяем, сколько активных осталось
        active_count = sum(1 for x in self.players if x.is_playing)
        if active_count < 2:
            self.status = GameStatus.WAITING # Выкидываем в лобби!
            return
            
        # Корректируем индекс хода
        if idx < self.current_turn_index:
            self.current_turn_index -= 1
        elif is_current_turn:
            # Если это был его ход, "отматываем" индекс назад и вызываем next_turn, 
            # чтобы он корректно перепрыгнул зрителей и нашел следующего ИГРОКА.
            self.current_turn_index -= self.direction
            self.next_turn()
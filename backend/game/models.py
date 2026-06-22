import random
import uuid
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

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


class Player(BaseModel):
    id: str
    points: int = 0
    name: str
    hand: List[Card] = []


class GameStatus(str, Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"







class GameRoom(BaseModel):
    room_id: str
    players: List[Player] = []
    status: GameStatus = GameStatus.WAITING
    deck: List[Card] = []
    discard_pile: List[Card] = []
    current_turn_index: int = 0
    direction: int = 1
    has_drawn_this_turn: bool = False 
    
    # НОВЫЕ ПОЛЯ:
    penalty_cards: int = 0 # Сколько карт должен взять текущий игрок (для +2 и +4)
    declared_color: Optional[Color] = None # Загаданный цвет после черной карты

    def _generate_deck(self):
        # (ОСТАВЛЯЕМ КАК БЫЛО)
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

    def start_game(self):
        if len(self.players) < 2: raise ValueError("Для начала игры нужно минимум 2 игрока")
        self._generate_deck()
        import random
        random.shuffle(self.deck)
        for player in self.players:
            player.hand = [self.deck.pop() for _ in range(7)]
        first_card = self.deck.pop()
        self.discard_pile.append(first_card)
        self.status = GameStatus.PLAYING
        self.current_turn_index = 0
        self.has_drawn_this_turn = False
        self.penalty_cards = 0
        self.declared_color = None

    def can_play_card(self, card: Card) -> bool:
        if not self.discard_pile: return False
        top_card = self.discard_pile[-1]

        # Если висит загаданный цвет (была сыграна черная карта)
        if self.declared_color:
            if card.color == Color.BLACK: return True
            if card.color == self.declared_color: return True
            if card.card_type != CardType.NUMBER and card.card_type == top_card.card_type: return True # Например +4 на +4
            return False

        # Обычные правила
        if card.color == Color.BLACK or top_card.color == Color.BLACK: return True
        if card.color == top_card.color: return True
        if card.card_type != CardType.NUMBER and card.card_type == top_card.card_type: return True
        if card.card_type == CardType.NUMBER and card.value == top_card.value: return True
        return False

    def next_turn(self):
        self.current_turn_index = (self.current_turn_index + self.direction) % len(self.players)
        self.has_drawn_this_turn = False

    def play_cards(self, player_id: str, card_ids: List[str], declared_color: Optional[Color] = None):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Сейчас не твой ход!")
        
        # Если висит штраф, обычные карты кидать нельзя (пока не сделаем систему перевода)
        if self.penalty_cards > 0:
            raise ValueError("Сначала ты должен принять штрафные карты!")

        if not card_ids: raise ValueError("Не выбрано ни одной карты!")

        cards_to_play = []
        for cid in card_ids:
            card = next((c for c in current_player.hand if c.id == cid), None)
            if not card: raise ValueError("Карта не найдена в руке!")
            cards_to_play.append(card)

        # Проверка правил цепочки (Оставляем как было)
        if not self.can_play_card(cards_to_play[0]): raise ValueError("Первая карта не подходит к сбросу!")
        for i in range(1, len(cards_to_play)):
            prev_card, curr_card = cards_to_play[i-1], cards_to_play[i]
            if curr_card.card_type == CardType.NUMBER and prev_card.card_type == CardType.NUMBER:
                if curr_card.value != prev_card.value: raise ValueError("Только одинаковые цифры!")
            elif curr_card.card_type != CardType.NUMBER and prev_card.card_type != CardType.NUMBER:
                if curr_card.card_type != prev_card.card_type: raise ValueError("Только одинаковые спец-карты!")
            else: raise ValueError("Нельзя смешивать!")

        last_card = cards_to_play[-1] # Эффект задает последняя брошенная карта

        # Обработка выбора цвета для черных карт
        if last_card.color == Color.BLACK:
            if not declared_color: raise ValueError("Необходимо выбрать цвет!")
            self.declared_color = declared_color
        else:
            self.declared_color = None # Сбрасываем цвет, если брошена обычная карта

        # Начисление штрафов за ВСЕ кинутые карты (Стакаем +2 и +4)
        for c in cards_to_play:
            if c.card_type == CardType.DRAW_TWO: self.penalty_cards += 2
            if c.card_type == CardType.WILD_DRAW_FOUR: self.penalty_cards += 4

        # Перенос карт в сброс
        for c in cards_to_play:
            current_player.hand.remove(c)
            self.discard_pile.append(c)

        # ПРОВЕРКА НА ПОБЕДУ
        if len(current_player.hand) == 0:
            self.status = GameStatus.FINISHED
            return # Игра окончена, ход не передаем

        # Эффекты направления и пропуска
        if last_card.card_type == CardType.REVERSE:
            self.direction *= -1
            if len(self.players) == 2: self.next_turn() # Для 2 игроков реверс работает как пропуск
            
        if last_card.card_type == CardType.SKIP:
            self.next_turn() # Пропускаем следующего

        self.next_turn() # Обычная передача хода

    def take_penalty(self, player_id: str):
        """Жертва принимает штраф (+2/+4) в руку и теряет ход"""
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Сейчас не твой ход!")
        if self.penalty_cards == 0: raise ValueError("Нет штрафа для взятия!")

        for _ in range(self.penalty_cards):
            if self.deck: current_player.hand.append(self.deck.pop())
            # Иначе надо перемешивать сброс, пока игнорируем для прототипа
        
        self.penalty_cards = 0
        self.next_turn() # Жертва взяла карты и пропустила ход

    # draw_card и pass_turn оставляем как были
    def draw_card(self, player_id: str):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Не твой ход!")
        if self.has_drawn_this_turn: raise ValueError("Уже брал карту!")
        if self.penalty_cards > 0: raise ValueError("Надо взять штраф!")
        if self.deck: current_player.hand.append(self.deck.pop())
        self.has_drawn_this_turn = True

    def pass_turn(self, player_id: str):
        current_player = self.players[self.current_turn_index]
        if current_player.id != player_id: raise ValueError("Не твой ход!")
        if not self.has_drawn_this_turn: raise ValueError("Надо взять карту!")
        self.next_turn()
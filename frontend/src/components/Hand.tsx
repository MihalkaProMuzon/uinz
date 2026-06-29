import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
// import { SortableCard } from './SortableCard';
import { useDroppable } from '@dnd-kit/core';
import { useMemo } from 'react';

interface HandProps {
  cards: any[];
  isMyTurn: boolean;
}

export function Hand({ cards, isMyTurn }: HandProps) {
  const { setNodeRef } = useDroppable({ id: 'hand-zone' });
  const itemIds = useMemo(() => cards.map(c => c.id), [cards]);

  return (
    // Декоративный контейнер (задний фон)
    <div className="fixed bottom-[-40px] left-0 right-0 flex justify-center h-[250px] pointer-events-none">
      <div 
        ref={setNodeRef}
        // Убрали flex, сделали position: relative для привязки абсолютных карт!
        className={`relative w-[600px] h-full transition-colors rounded-t-3xl ${isMyTurn ? 'bg-green-500/10' : 'bg-transparent'} pointer-events-auto`}
      >
        {/* <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          {cards.map((card, index) => (
            <SortableCard 
              key={card.id} 
              card={card} 
              index={index} 
              totalCards={cards.length}
              zone="hand" // Говорим карте, что она в руке
            />
          ))}
        </SortableContext> */}
      </div>
    </div>
  );
}
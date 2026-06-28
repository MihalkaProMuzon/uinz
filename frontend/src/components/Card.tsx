import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { getCardImage, cn } from '../lib/utils';
import { GAME_CONFIG } from '../lib/config';

interface CardProps extends HTMLMotionProps<"div"> {
  card: any;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ card, className, style, ...props }, ref) => {
    const imgUrl = getCardImage(card);
    const isHidden = card.color === 'hidden';
    const bgColor = isHidden ? '#452929' : (card.color === 'black' ? '#222' : card.color);
    const textColor = card.color === 'yellow' ? 'black' : 'white';

    return (
      <motion.div
        ref={ref}
        className={cn(
          "absolute rounded-xl shadow-lg border-1 select-none overflow-hidden bg-white flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0",
          className
        )}
        style={{ 
          width: GAME_CONFIG.CARD_WIDTH, 
          height: GAME_CONFIG.CARD_HEIGHT, 
          marginLeft: -(GAME_CONFIG.CARD_WIDTH / 2),
          marginBottom: -(GAME_CONFIG.CARD_HEIGHT / 2),
          ...style 
        }}
        drag
        dragElastic={0.2} // Сделаем чуть меньше эластичности, чтобы карта ощущалась тяжелее
        dragMomentum={false}
        //  Заставляет карту всегда возвращаться в X/Y из `animate` после отпускания мыши
        dragSnapToOrigin={true} 
        
        // Когда мы тащим карту, она чуть увеличивается и поднимается выше всех
        whileDrag={{ scale: 1.1, zIndex: 999 }}
        {...props}
      >
        <div className="absolute inset-2 rounded-lg flex flex-col items-center justify-center" style={{ backgroundColor: bgColor, color: textColor }}>
          {isHidden ? <span className="text-4xl font-bold opacity-50">UNO</span> : (
            <><span className="text-xs uppercase absolute top-2 left-2">{card.color}</span><span className="text-lg font-bold">{card.card_type}</span><span className="text-l">{card.value ?? '★'}</span></>
          )}
        </div>
        <img src={imgUrl} alt={`${card.color}`} className="absolute inset-0 w-full h-full object-cover pointer-events-none" onError={(e) => e.currentTarget.style.display = 'none'} />
      </motion.div>
    );
  }
);
Card.displayName = 'Card';
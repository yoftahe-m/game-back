const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['H', 'D', 'C', 'S'];
const SUIT_SYMBOLS = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED_SUITS = ['H', 'D'];
const INITIAL_HAND_SIZE = 7;

const createDeck = () => {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
};

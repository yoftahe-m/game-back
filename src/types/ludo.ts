export type Pin = {
  position: string;
  color: PinColor;
  home: string;
  openPosition: string;
};

export type PinColor = 'red' | 'blue' | 'green' | 'yellow';

export type BoardSquare = {
  type: 'neutral' | 'home' | 'win';
  color: CellColor;
  next: string | null;
  colorPath: string | null;
  id: string;
  safe?: boolean;
  yellow?: string;
  blue?: string;
  green?: string;
  red?: string;
};

type CellColor = 'red' | 'blue' | 'green' | 'yellow' | null;

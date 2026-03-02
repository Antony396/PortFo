// This is the "Rulebook" for your data

export interface Transaction {
  id: string;
  symbol: string;       // e.g., "AAPL"
  type: 'BUY' | 'SELL'; // Only allows these two words
  quantity: number;     // e.g., 10
  price: number;        // The price you paid at that time
  date: string;         // ISO date string
}

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;     // Total shares owned
  averageCost: number;  // Weighted average of all BUYS
  currentPrice: number; // Fetched from the API
  totalValue: number;   // quantity * currentPrice
  totalGainLoss: number;// totalValue - (quantity * averageCost)
  percentageChange: number;
}
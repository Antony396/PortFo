'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import PriceDisplay from '../../components/portfolio/PriceDisplay';
import PieChart from '../../components/portfolio/PieChart';
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

export default function DashboardPage() {
  // 1. Core Portfolio State
  const [stocks, setStocks] = useState([
    { symbol: 'AAPL', quantity: 1, avgPrice: 150 },
    { symbol: 'MSFT', quantity: 3, avgPrice: 412 },
    { symbol: 'NVDA', quantity: 3, avgPrice: 150 },
  ]);

  // 2. UI & Search State
  const [newSymbol, setNewSymbol] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Save Portfolio');
  const [isEditing, setIsEditing] = useState(false);
  const [editBackup, setEditBackup] = useState<any[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<{symbol:string;value:number}[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- PERSISTENCE LOGIC ---
  useEffect(() => {
    const saved = localStorage.getItem('my_portfolio');
    if (saved) {
      try {
        setStocks(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load portfolio:", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('my_portfolio', JSON.stringify(stocks));
  }, [stocks]);

  const manualSave = () => {
    localStorage.setItem('my_portfolio', JSON.stringify(stocks));
    setSaveStatus('Saved To Browser');
    setIsEditing(false);
    setEditBackup([]);
    setTimeout(() => setSaveStatus('Save Portfolio'), 2000);
  };

  const toggleEditMode = () => {
    if (isEditing) {
      // Cancel - restore from backup
      setStocks(editBackup);
      setIsEditing(false);
      setEditBackup([]);
    } else {
      // Enter edit mode - save backup
      setEditBackup(JSON.parse(JSON.stringify(stocks)));
      setIsEditing(true);
    }
  };

  // --- ACTIONS & SEARCH ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = async (query: string) => {
    setNewSymbol(query);
    if (query.length > 0) {
      try {
        const res = await fetch(`/api/search?q=${query.toUpperCase()}`);
        const data = await res.json();
        setSuggestions(data.result || []);
        setShowDropdown(true);
      } catch (e) {
        console.error("Search error", e);
      }
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const addStock = (item: any) => {
    const ticker = item.symbol.toUpperCase();
    if (!stocks.find(s => s.symbol === ticker)) {
      setStocks([...stocks, { symbol: ticker, quantity: 0, avgPrice: 0 }]);
    }
    setNewSymbol('');
    setShowDropdown(false);
  };

  const removeStock = (symbol: string) => {
    setStocks(prev => prev.filter(s => s.symbol !== symbol));
  };

  const updateStock = (symbol: string, field: 'quantity' | 'avgPrice', val: string) => {
    const numVal = val === '' ? 0 : parseFloat(val);
    setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, [field]: numVal } : s));
  };

  return (
    <div className="min-h-screen bg-[#fafafa] py-12 px-4 font-sans text-gray-900">
      <div className="max-w-[1300px] mx-auto relative">
        
        {/* HEADER SECTION */}
        <div className="flex justify-between items-end px-10 mb-10">
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
              Wall St <span className="text-blue-500 text-2xl">☁️</span>
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] mt-1">Live Portfolio</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Action Buttons */}
            <Link
              href="/dcf"
              className="px-5 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
            >
              DCF Calc
            </Link>

            <button 
              onClick={toggleEditMode}
              className={`px-5 py-3 border rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${
                isEditing 
                  ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600' 
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {isEditing ? 'Cancel' : 'Edit Portfolio'}
            </button>

            {isEditing && (
            <button 
              onClick={manualSave}
              className="px-5 py-3 bg-green-500 text-white border border-green-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-sm active:scale-95"
            >
              {saveStatus}
            </button>
          )}



            <SignedOut>
              <SignInButton mode="modal">
                <button className="px-6 py-3 bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 active:scale-95">
                  Sync to Account
                </button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <div className="bg-white p-1 rounded-full border border-gray-100 shadow-sm hover:scale-105 transition-transform">
                <UserButton afterSignOutUrl="/dashboard" />
              </div>
            </SignedIn>

            {/* SEARCH BAR */}
            {isEditing && (
              <div className="relative" ref={dropdownRef}>
                <input 
                  type="text"
                  placeholder="Add Ticker (e.g. NVDA)"
                  value={newSymbol}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 shadow-sm w-[280px] transition-all"
                />

                {showDropdown && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                    {suggestions.map((item) => (
                      <button
                        key={item.symbol}
                        onClick={() => addStock(item)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                      >
                        <div className="flex flex-col">
                          <span className="font-black text-sm">{item.symbol}</span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase truncate max-w-[180px]">
                            {item.description}
                          </span>
                        </div>
                        <span className="text-blue-500 font-bold text-[10px] uppercase">Add +</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {/* PORTFOLIO GRID */}
        <div className="bg-white rounded-[3rem] shadow-[0_30px_70px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {/* Grid Headers */}
          <div className="grid grid-cols-12 px-10 pt-10 pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <span className="col-span-2">Asset</span>
            <span className="col-span-2 text-center">Avg Price</span>
            <span className="col-span-1 text-center">Qty</span>
            <span className="col-span-2 text-right">Market Price</span>
            <span className="col-span-2 text-right">24h</span>
            <span className="col-span-1 text-right">Value</span>
            <span className="col-span-2 text-right">Profit/Loss</span>
          </div>

          <div className="divide-y divide-gray-50">
            {stocks.map((stock) => (
              <div key={stock.symbol} className="p-10 hover:bg-gray-50/50 transition-all group relative">
                {isEditing && (
                  <button 
                    onClick={() => removeStock(stock.symbol)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-300 hover:text-rose-500 transition-all text-xs p-2"
                  >
                    ✕
                  </button>
                )}

                <PriceDisplay 
                  symbol={stock.symbol} 
                  avgPrice={stock.avgPrice}
                  quantity={stock.quantity}
                >
                  <div className="grid grid-cols-3 items-center justify-center gap-4">
                    {/* avg price column */}
                    {isEditing ? (
                      <div className="relative w-full col-span-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                        <input 
                          type="number"
                          value={stock.avgPrice || ''}
                          onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                          className="w-full pl-7 pr-3 py-3 bg-gray-50 border-transparent border focus:border-blue-500 rounded-2xl font-bold focus:outline-none focus:bg-white transition-all text-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-gray-700 font-bold col-span-2 text-center">
                        ${stock.avgPrice.toFixed(2)}
                      </span>
                    )}

                    {/* quantity column */}
                    {isEditing ? (
                      <input 
                        type="number"
                        placeholder="Qty"
                        value={stock.quantity || ''}
                        onChange={(e) => updateStock(stock.symbol, 'quantity', e.target.value)}
                        className="w-full px-2 py-3 bg-gray-50 border-transparent border focus:border-blue-500 rounded-2xl font-bold text-center focus:outline-none focus:bg-white transition-all text-sm col-span-1"
                      />
                    ) : (
                      <span className="text-gray-700 font-bold col-span-1 text-center">
                        {stock.quantity}
                      </span>
                    )}
                  </div>
                </PriceDisplay>
              </div>
            ))}
            
            {stocks.length === 0 && (
              <div className="p-20 text-center text-gray-300 font-bold uppercase tracking-widest text-xs">
                Your portfolio is empty. Search above to begin.
              </div>
            )}
          </div>
        </div>
        {/* chart trigger & display */}
        <div className="mt-6 px-10">
          <button
            onClick={async () => {
              try {
                setChartLoading(true);
                const results = await Promise.all(stocks.map(async (s) => {
                  const res = await fetch(`/api/price/${s.symbol}`);
                  const json = await res.json();
                  const price = json.currentPrice || 0;
                  const total = price * s.quantity;
                  return { symbol: s.symbol, value: total };
                }));
                setChartData(results);
                setShowChart(true);
              } catch (e) {
                console.error('Chart data error', e);
              } finally {
                setChartLoading(false);
              }
            }}
            className="px-5 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            Show Chart
          </button>

          {showChart && (
            <div className="mt-4 relative">
              <button
                onClick={() => setShowChart(false)}
                className="absolute top-1 left-1 text-xs text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
              {chartLoading ? (
                <div className="text-center py-10">Loading…</div>
              ) : (
                <PieChart data={chartData} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
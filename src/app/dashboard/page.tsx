'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import PriceDisplay from '../../components/portfolio/PriceDisplay';
import PieChart from '../../components/portfolio/PieChart';
import { SignInButton, SignOutButton, SignedIn, SignedOut, useUser } from "@clerk/nextjs";

export default function DashboardPage() {
  const { user } = useUser();

  type SidebarRow = {
    symbol: string;
    value: number;
    percentChange: number;
    dayChangeValue: number;
  };

  type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
  };

  // 1. Core Portfolio State
  const [stocks, setStocks] = useState([
    { symbol: 'AAPL', quantity: 1, avgPrice: 150 },
    { symbol: 'MSFT', quantity: 3, avgPrice: 412 },
    { symbol: 'NVDA', quantity: 3, avgPrice: 150 },
  ]);

  // 2. UI & Search State
  const [newSymbol, setNewSymbol] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newBuyPrice, setNewBuyPrice] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addStatus, setAddStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('Save Portfolio');
  const [isEditing, setIsEditing] = useState(false);
  const [editBackup, setEditBackup] = useState<any[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<{symbol:string;value:number}[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(true);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarRows, setSidebarRows] = useState<SidebarRow[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi — I can help explain your portfolio, day moves, quick risk notes, and I can help you make changes to your portfolio.',
    },
  ]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      setNewSymbol('');
      setNewQuantity('');
      setNewBuyPrice('');
      setSuggestions([]);
      setShowDropdown(false);
      setAddStatus('');
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, chatLoading]);

  const handleSearchChange = async (query: string) => {
    setNewSymbol(query);
    if (query.length > 0) {
      try {
        const res = await fetch(`/api/search?q=${query.toUpperCase()}`);
        const data = await res.json();
        const rawResults = data.result || [];
        const uniqueResults = rawResults.filter(
          (item: any, index: number, arr: any[]) =>
            arr.findIndex((entry: any) => entry.symbol === item.symbol) === index
        );
        setSuggestions(uniqueResults);
        setShowDropdown(true);
      } catch (e) {
        console.error("Search error", e);
      }
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const selectSuggestion = (item: any) => {
    const ticker = String(item.symbol || '').toUpperCase();
    if (ticker) {
      setNewSymbol(ticker);
    }
    setShowDropdown(false);
  };

  const addOrMergeHolding = () => {
    const ticker = newSymbol.trim().toUpperCase();
    const qtyToAdd = parseFloat(newQuantity);
    const buyPrice = parseFloat(newBuyPrice);

    if (!ticker) {
      setAddStatus('Enter a ticker first');
      return;
    }

    if (!(qtyToAdd > 0) || !(buyPrice > 0)) {
      setAddStatus('Enter quantity and buy price');
      return;
    }

    let merged = false;
    setStocks((prev) => {
      const existing = prev.find((stock) => stock.symbol === ticker);

      if (!existing) {
        return [...prev, { symbol: ticker, quantity: qtyToAdd, avgPrice: buyPrice }];
      }

      merged = true;
      const combinedQuantity = existing.quantity + qtyToAdd;
      const combinedAvgPrice =
        combinedQuantity > 0
          ? (existing.quantity * existing.avgPrice + qtyToAdd * buyPrice) / combinedQuantity
          : buyPrice;

      return prev.map((stock) =>
        stock.symbol === ticker
          ? {
              ...stock,
              quantity: parseFloat(combinedQuantity.toFixed(6)),
              avgPrice: parseFloat(combinedAvgPrice.toFixed(6)),
            }
          : stock
      );
    });

    setAddStatus(merged ? 'Lot merged into holding' : 'New holding added');
    setNewSymbol('');
    setNewQuantity('');
    setNewBuyPrice('');
    setSuggestions([]);
    setShowDropdown(false);
    setTimeout(() => setAddStatus(''), 2000);
  };

  const removeStock = (symbol: string) => {
    setStocks(prev => prev.filter(s => s.symbol !== symbol));
  };

  const updateStock = (symbol: string, field: 'quantity' | 'avgPrice', val: string) => {
    const numVal = val === '' ? 0 : parseFloat(val);
    setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, [field]: numVal } : s));
  };

  useEffect(() => {
    const loadSidebarMetrics = async () => {
      if (stocks.length === 0) {
        setSidebarRows([]);
        return;
      }

      setSidebarLoading(true);
      try {
        const metrics = await Promise.all(
          stocks.map(async (stock) => {
            try {
              const res = await fetch(`/api/price/${stock.symbol}`);
              const json = await res.json();
              const currentPrice = json.currentPrice || 0;
              const percentChange = json.percentChange || 0;
              const value = currentPrice * stock.quantity;
              const dayChangeValue = value * (percentChange / 100);

              return {
                symbol: stock.symbol,
                value,
                percentChange,
                dayChangeValue,
              } as SidebarRow;
            } catch {
              return {
                symbol: stock.symbol,
                value: 0,
                percentChange: 0,
                dayChangeValue: 0,
              } as SidebarRow;
            }
          })
        );

        setSidebarRows(metrics);
      } finally {
        setSidebarLoading(false);
      }
    };

    loadSidebarMetrics();
  }, [stocks]);

  const totalValue = sidebarRows.reduce((sum, row) => sum + row.value, 0);
  const totalDayChange = sidebarRows.reduce((sum, row) => sum + row.dayChangeValue, 0);

  const fetchChartData = async () => {
    if (showChart) {
      setShowChart(false);
      return;
    }

    try {
      setChartLoading(true);
      const results = await Promise.all(stocks.map(async (stock) => {
        const res = await fetch(`/api/price/${stock.symbol}`);
        const json = await res.json();
        const price = json.currentPrice || 0;
        const total = price * stock.quantity;
        return { symbol: stock.symbol, value: total };
      }));
      setChartData(results);
      setShowAiHelper(false);
      setShowChart(true);
    } catch (error) {
      console.error('Chart data error', error);
    } finally {
      setChartLoading(false);
    }
  };

  const toggleAiHelper = () => {
    if (showAiHelper) {
      setShowAiHelper(false);
      return;
    }

    setShowChart(false);
    setShowAiHelper(true);
  };

  const toggleMoreActions = () => {
    setShowMoreActions((prev) => !prev);
  };

  const userDisplayName =
    user?.username ||
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Signed in';

  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          holdings: stocks,
          overview: {
            totalValue,
            totalDayChange,
          },
        }),
      });

      const data = await response.json();
      const reply = typeof data?.reply === 'string' ? data.reply : 'I could not generate a response right now.';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'AI helper is temporarily unavailable. Please try again.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const aiHelperPanel = (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
      <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-50">AI Helper</p>
      <p className="mt-1 text-[10px] text-blue-200/70">
        By using AI Helper, you agree to our{' '}
        <Link href="/privacy" className="underline hover:text-blue-100 transition-colors">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/ai-disclaimer" className="underline hover:text-blue-100 transition-colors">
          AI Disclaimer
        </Link>
        .
      </p>

      <div className="mt-3 max-h-[260px] overflow-y-auto space-y-2 pr-1">
        {chatMessages.map((entry, index) => (
          <div
            key={`${entry.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
              entry.role === 'assistant'
                ? 'bg-white/10 text-blue-100 border border-white/10'
                : 'bg-blue-600/80 text-white border border-blue-400/40'
            }`}
          >
            {entry.content}
          </div>
        ))}
        {chatLoading && (
          <div className="rounded-lg px-3 py-2 text-[12px] bg-white/10 text-blue-200 border border-white/10">
            Thinking…
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              sendChatMessage();
            }
          }}
          placeholder="Ask about your holdings"
          className="flex-1 px-3 py-2 bg-slate-800/80 text-slate-100 border border-white/10 rounded-lg text-[12px] font-medium focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={sendChatMessage}
          disabled={chatLoading}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-[12px] font-semibold hover:bg-blue-700 transition-all disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-8 md:py-12 px-3 md:pl-3 md:pr-5 font-sans text-slate-100 relative overflow-x-hidden">
      <div className="hidden lg:block fixed inset-y-0 left-0 w-[220px] bg-white/5 border-r border-white/10 backdrop-blur-sm pointer-events-none" />
      <div className="hidden lg:block fixed inset-y-0 right-0 w-[340px] bg-white/5 border-l border-white/10 backdrop-blur-sm pointer-events-none" />
      <div className="w-full relative z-10">
        
        {/* HEADER SECTION */}
        <div className="px-2 md:px-10 mb-8">
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
              PortFo
            </h2>
            <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.18em] mt-1">Live Portfolio</p>
          </div>
        </div>

        <div className="lg:hidden space-y-4 px-1">
          <div className="bg-white/5 rounded-2xl border border-white/10 shadow-sm p-4 flex flex-col gap-2 backdrop-blur-md">
            <div className="grid grid-cols-1 gap-2">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold hover:bg-blue-700 transition-all">
                    Login
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <SignOutButton redirectUrl="/dashboard">
                  <button className="w-full px-4 py-2.5 bg-white/10 border border-white/10 rounded-xl text-[12px] font-semibold text-blue-50 truncate">
                    Logout
                  </button>
                </SignOutButton>
              </SignedIn>

              <button
                onClick={toggleMoreActions}
                className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50"
              >
                {showMoreActions ? 'Less...' : 'More...'}
              </button>

              {showMoreActions && (
                <>
                  <Link
                    href="/dcf"
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 text-center"
                  >
                    DCF Calc
                  </Link>
                  <button
                    onClick={fetchChartData}
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50"
                  >
                    Show Chart
                  </button>
                  <button
                    onClick={toggleAiHelper}
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50"
                  >
                    AI Helper
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-50">Overview</p>
            {sidebarLoading ? (
              <p className="mt-3 text-sm font-medium text-blue-100">Loading…</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Portfolio Value</p>
                  <p className="text-sm font-semibold text-white">${totalValue.toFixed(2)}</p>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Day Change</p>
                  <p className={`text-sm font-semibold ${totalDayChange >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {totalDayChange >= 0 ? '+' : ''}${Math.abs(totalDayChange).toFixed(2)}
                  </p>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Holdings</p>
                  <p className="text-sm font-semibold text-white">{stocks.length}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-blue-200/70 uppercase tracking-[0.1em]">Swipe table left/right to view all columns</p>
          <div className="overflow-x-auto overflow-y-visible">
            <div className="bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 backdrop-blur-md overflow-visible min-w-[980px]">
              <div className="grid grid-cols-12 px-8 pt-7 pb-4 text-[11px] font-semibold text-blue-200/80 uppercase tracking-[0.08em]">
                <span className="col-span-2">Asset</span>
                <span className="col-span-2 text-center">Avg Price</span>
                <span className="col-span-1 text-center">Qty</span>
                <span className="col-span-2 text-right">Market Price</span>
                <span className="col-span-2 text-center">24h</span>
                <span className="col-span-1 text-right">Value</span>
                <span className="col-span-2 text-right">Profit/Loss</span>
              </div>

              <div className="divide-y divide-white/10">
                {stocks.map((stock) => (
                  <div key={`mobile-row-${stock.symbol}`} className="px-8 py-6 hover:bg-white/5 transition-all group relative">
                    {isEditing && (
                      <button
                        onClick={() => removeStock(stock.symbol)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-300 hover:text-rose-500 transition-all text-xs p-2"
                      >
                        ✕
                      </button>
                    )}

                    <PriceDisplay symbol={stock.symbol} avgPrice={stock.avgPrice} quantity={stock.quantity}>
                      <div className="grid grid-cols-3 items-center justify-center gap-4">
                        {isEditing ? (
                          <div className="relative w-full col-span-2">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200/60 font-bold text-xs">$</span>
                            <input
                              type="number"
                              value={stock.avgPrice || ''}
                              onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                              className="w-full pl-7 pr-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                            />
                          </div>
                        ) : (
                          <span className="text-slate-100 font-bold col-span-2 text-center">${stock.avgPrice.toFixed(2)}</span>
                        )}

                        {isEditing ? (
                          <input
                            type="number"
                            placeholder="Qty"
                            value={stock.quantity || ''}
                            onChange={(e) => updateStock(stock.symbol, 'quantity', e.target.value)}
                            className="w-full px-2 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold text-center focus:outline-none focus:bg-slate-800 transition-all text-sm col-span-1"
                          />
                        ) : (
                          <span className="text-slate-100 font-bold col-span-1 text-center">{stock.quantity}</span>
                        )}
                      </div>
                    </PriceDisplay>
                  </div>
                ))}

                {isEditing && (
                  <div className="px-8 py-5 bg-white/5 border-t border-white/10">
                    <div className="relative" ref={dropdownRef}>
                      <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-100 mb-2">Add or Merge Lot</p>
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          placeholder="Ticker (e.g. IVV.AX)"
                          value={newSymbol}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onFocus={() => setShowDropdown(true)}
                          className="px-4 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            placeholder="Qty"
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(e.target.value)}
                            className="px-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold"
                          />
                          <input
                            type="number"
                            placeholder="Buy Price"
                            value={newBuyPrice}
                            onChange={(e) => setNewBuyPrice(e.target.value)}
                            className="px-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold"
                          />
                        </div>
                        <button
                          onClick={addOrMergeHolding}
                          className="px-3 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold"
                        >
                          Add
                        </button>
                      </div>

                      {showDropdown && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                          {suggestions.map((item) => (
                            <button
                              key={`mobile-suggest-${item.symbol}`}
                              onClick={() => selectSuggestion(item)}
                              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/10 last:border-0"
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm text-slate-100">{item.symbol}</span>
                                <span className="text-[10px] text-blue-200/70 font-medium truncate max-w-[280px]">
                                  {item.description}
                                </span>
                              </div>
                              <span className="text-blue-300 font-semibold text-[11px]">Use</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-start gap-3">
            <button
              onClick={toggleEditMode}
              className={`px-5 py-2.5 border rounded-xl text-[12px] font-semibold transition-all ${
                isEditing
                  ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                  : 'bg-white/10 border-white/15 text-blue-100 hover:bg-white/15'
              }`}
            >
              {isEditing ? 'Cancel' : 'Edit Portfolio'}
            </button>

            {isEditing && (
              <button
                onClick={manualSave}
                className="px-5 py-2.5 bg-green-500 text-white border border-green-500 rounded-xl text-[12px] font-semibold hover:bg-green-600 transition-all"
              >
                {saveStatus}
              </button>
            )}
          </div>

          {showAiHelper && aiHelperPanel}

          {showChart && (
            <div className="mt-2 relative">
              <button
                onClick={() => setShowChart(false)}
                className="absolute top-2 left-3 text-xs text-blue-200/80 hover:text-blue-100 z-10"
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

        <div className="hidden lg:grid lg:grid-cols-[190px_minmax(0,1fr)_300px] items-stretch lg:items-start gap-6 pl-0 pr-0 md:pr-2 lg:pr-0">
          <aside className="w-full shrink-0">
            <div className="bg-white/5 rounded-2xl border border-white/10 shadow-sm p-4 flex flex-col gap-3 lg:sticky lg:top-6 backdrop-blur-md">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold hover:bg-blue-700 transition-all shadow-sm active:scale-95">
                    Login
                  </button>
                </SignInButton>
              </SignedOut>

              <SignedIn>
                <SignOutButton redirectUrl="/dashboard">
                  <button
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/10 rounded-xl text-[12px] font-semibold text-blue-50 text-center truncate hover:bg-white/15 transition-all"
                    title={`${userDisplayName} • Click to logout`}
                  >
                    {userDisplayName} • Logout
                  </button>
                </SignOutButton>
              </SignedIn>
              <button
                onClick={toggleMoreActions}
                className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
              >
                {showMoreActions ? 'Less...' : 'More...'}
              </button>

              {showMoreActions && (
                <>
                  <Link
                    href="/dcf"
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all text-center"
                  >
                    DCF Calc
                  </Link>
                  <button
                    onClick={fetchChartData}
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
                  >
                    Show Chart
                  </button>

                  <button
                    onClick={toggleAiHelper}
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
                  >
                    AI Helper
                  </button>
                </>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 px-1 flex justify-center">
              <p className="text-sm font-semibold tracking-[0.02em] text-blue-100 text-center">
                Create, Merge, and Track Your Holdings
              </p>
            </div>

            <div className="overflow-x-auto overflow-y-visible">
              <div className="bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 backdrop-blur-md overflow-visible min-w-[980px]">
              <div className="grid grid-cols-12 px-8 pt-7 pb-4 text-[11px] font-semibold text-blue-200/80 uppercase tracking-[0.08em]">
                <span className="col-span-2">Asset</span>
                <span className="col-span-2 text-center">Avg Price</span>
                <span className="col-span-1 text-center">Qty</span>
                <span className="col-span-2 text-right">Market Price</span>
                <span className="col-span-2 text-center">24h</span>
                <span className="col-span-1 text-right">Value</span>
                <span className="col-span-2 text-right">Profit/Loss</span>
              </div>

              <div className="divide-y divide-white/10">
                {stocks.map((stock) => (
                  <div key={stock.symbol} className="px-8 py-6 hover:bg-white/5 transition-all group relative">
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
                        {isEditing ? (
                          <div className="relative w-full col-span-2">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200/60 font-bold text-xs">$</span>
                            <input 
                              type="number"
                              value={stock.avgPrice || ''}
                              onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                              className="w-full pl-7 pr-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                            />
                          </div>
                        ) : (
                          <span className="text-slate-100 font-bold col-span-2 text-center">
                            ${stock.avgPrice.toFixed(2)}
                          </span>
                        )}

                        {isEditing ? (
                          <input 
                            type="number"
                            placeholder="Qty"
                            value={stock.quantity || ''}
                            onChange={(e) => updateStock(stock.symbol, 'quantity', e.target.value)}
                            className="w-full px-2 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold text-center focus:outline-none focus:bg-slate-800 transition-all text-sm col-span-1"
                          />
                        ) : (
                          <span className="text-slate-100 font-bold col-span-1 text-center">
                            {stock.quantity}
                          </span>
                        )}
                      </div>
                    </PriceDisplay>
                  </div>
                ))}

                {stocks.length === 0 && (
                  <div className="p-20 text-center text-blue-200/70 font-bold uppercase tracking-widest text-xs">
                    Your portfolio is empty. Search above to begin.
                  </div>
                )}

                {isEditing && (
                  <div className="px-8 py-5 bg-white/5 border-t border-white/10">
                    <div className="relative" ref={dropdownRef}>
                      <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-100 mb-2">Add or Merge Lot</p>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <input
                          type="text"
                          placeholder="Ticker (e.g. IVV.AX)"
                          value={newSymbol}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onFocus={() => setShowDropdown(true)}
                          className="col-span-1 md:col-span-5 px-4 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 shadow-sm transition-all"
                        />
                        <input
                          type="number"
                          placeholder="Qty"
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                          className="col-span-1 md:col-span-2 px-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold text-center focus:outline-none focus:border-blue-400 shadow-sm transition-all"
                        />
                        <input
                          type="number"
                          placeholder="Buy Price"
                          value={newBuyPrice}
                          onChange={(e) => setNewBuyPrice(e.target.value)}
                          className="col-span-1 md:col-span-3 px-3 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 rounded-xl text-sm font-semibold text-center focus:outline-none focus:border-blue-400 shadow-sm transition-all"
                        />
                        <button
                          onClick={addOrMergeHolding}
                          className="col-span-1 md:col-span-2 px-3 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold hover:bg-blue-700 transition-all"
                        >
                          Add
                        </button>
                      </div>

                      <p className="mt-2 text-[11px] font-medium text-blue-200/80">
                        Enter quantity and buy price — average price updates automatically when merged.
                      </p>
                      {addStatus && <p className="mt-1 text-[11px] font-semibold text-blue-700">{addStatus}</p>}

                      {showDropdown && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                          {suggestions.map((item) => (
                            <button
                              key={item.symbol}
                              onClick={() => selectSuggestion(item)}
                              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/10 last:border-0"
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm text-slate-100">{item.symbol}</span>
                                <span className="text-[10px] text-blue-200/70 font-medium truncate max-w-[280px]">
                                  {item.description}
                                </span>
                              </div>
                              <span className="text-blue-300 font-semibold text-[11px]">Use</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>

            <div className="mt-5 flex items-center justify-start gap-3">
              <button
                onClick={toggleEditMode}
                className={`px-5 py-2.5 border rounded-xl text-[12px] font-semibold transition-all shadow-sm active:scale-95 ${
                  isEditing
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                    : 'bg-white/10 border-white/15 text-blue-100 hover:bg-white/15'
                }`}
              >
                {isEditing ? 'Cancel' : 'Edit Portfolio'}
              </button>

              {isEditing && (
                <button
                  onClick={manualSave}
                  className="px-5 py-2.5 bg-green-500 text-white border border-green-500 rounded-xl text-[12px] font-semibold hover:bg-green-600 transition-all shadow-sm active:scale-95"
                >
                  {saveStatus}
                </button>
              )}
            </div>

            {showAiHelper && aiHelperPanel}

            {showChart && (
              <div className="mt-4 relative">
                <button
                  onClick={() => setShowChart(false)}
                  className="absolute top-2 left-3 text-xs text-blue-200/80 hover:text-blue-100 z-10"
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

          <aside className="w-full shrink-0">
            <div className="w-full bg-white/5 rounded-2xl border border-white/10 shadow-sm p-4 lg:sticky lg:top-2 lg:-mt-3 backdrop-blur-md">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-50">Overview</p>
                {sidebarLoading ? (
                  <p className="mt-3 text-sm font-medium text-blue-100">Loading…</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Portfolio Value</p>
                      <p className="text-sm font-semibold text-white">${totalValue.toFixed(2)}</p>
                    </div>

                    <div className="h-px bg-white/10" />

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Day Change</p>
                      <p className={`text-sm font-semibold ${totalDayChange >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {totalDayChange >= 0 ? '+' : ''}${Math.abs(totalDayChange).toFixed(2)}
                      </p>
                    </div>

                    <div className="h-px bg-white/10" />

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Holdings</p>
                      <p className="text-sm font-semibold text-white">{stocks.length}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
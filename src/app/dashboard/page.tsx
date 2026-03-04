'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import PriceDisplay from '../../components/portfolio/PriceDisplay';
import PieChart from '../../components/portfolio/PieChart';
import { SignInButton, SignOutButton, SignedIn, SignedOut, useUser } from "@clerk/nextjs";

export default function DashboardPage() {
  const { user, isSignedIn, isLoaded } = useUser();

  type PortfolioHolding = {
    symbol: string;
    quantity: number;
    avgPrice: number;
  };

  type PortfolioRecoverySnapshot = {
    holdings: PortfolioHolding[];
    portfolioName: string;
    updatedAt: string;
  };

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

  const defaultExamplePortfolio = [
    { symbol: 'AAPL', quantity: 1, avgPrice: 100 },
    { symbol: 'MSFT', quantity: 1, avgPrice: 100 },
    { symbol: 'NVDA', quantity: 1, avgPrice: 100 },
    { symbol: 'META', quantity: 1, avgPrice: 100 },
    { symbol: 'TSLA', quantity: 1, avgPrice: 100 },
  ];

  const DEFAULT_PORTFOLIO_NAME = 'Example Portfolio';
  const PORTFOLIO_NAME_KEY = 'my_portfolio_name';
  const ACCOUNT_PORTFOLIO_BACKUP_PREFIX = 'portfo_account_portfolio_backup_v1_';

  // 1. Core Portfolio State
  const [stocks, setStocks] = useState(defaultExamplePortfolio);

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
  const [portfolioName, setPortfolioName] = useState(DEFAULT_PORTFOLIO_NAME);
  const [editNameBackup, setEditNameBackup] = useState(DEFAULT_PORTFOLIO_NAME);
  const [hasInitializedPortfolio, setHasInitializedPortfolio] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<{symbol:string;value:number}[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(true);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showMobileFullFields, setShowMobileFullFields] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarRows, setSidebarRows] = useState<SidebarRow[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi — I can help explain your portfolio, day moves, quick risk notes, and I can help you make changes to your portfolio.',
    },
  ]);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const mobileFullFieldsScrollRef = useRef<HTMLDivElement>(null);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const previousAuthStateRef = useRef<boolean | null>(null);

  const getAccountPortfolioBackupKey = (userId: string) => `${ACCOUNT_PORTFOLIO_BACKUP_PREFIX}${userId}`;

  const normalizePortfolioHoldings = (value: unknown): PortfolioHolding[] => {
    if (!Array.isArray(value)) return [];

    return value
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const stock = item as Partial<PortfolioHolding>;
        return (
          typeof stock.symbol === 'string' &&
          stock.symbol.trim().length > 0 &&
          typeof stock.quantity === 'number' &&
          Number.isFinite(stock.quantity) &&
          typeof stock.avgPrice === 'number' &&
          Number.isFinite(stock.avgPrice)
        );
      })
      .map((item) => {
        const stock = item as PortfolioHolding;
        return {
          symbol: stock.symbol.trim().toUpperCase(),
          quantity: stock.quantity,
          avgPrice: stock.avgPrice,
        };
      });
  };

  const saveAccountPortfolioBackup = (userId: string, holdings: PortfolioHolding[], portfolioNameValue: string) => {
    try {
      const safeName = portfolioNameValue.trim() || DEFAULT_PORTFOLIO_NAME;
      const normalizedHoldings = normalizePortfolioHoldings(holdings);
      const key = getAccountPortfolioBackupKey(userId);

      const incomingLooksEmpty = normalizedHoldings.length === 0 && safeName === DEFAULT_PORTFOLIO_NAME;
      if (incomingLooksEmpty) {
        const existingRaw = localStorage.getItem(key);
        if (existingRaw) {
          const existingParsed = JSON.parse(existingRaw) as Partial<PortfolioRecoverySnapshot>;
          const existingHoldings = normalizePortfolioHoldings(existingParsed.holdings);
          const existingName = typeof existingParsed.portfolioName === 'string' ? existingParsed.portfolioName.trim() : '';
          const existingHasMeaningfulData = existingHoldings.length > 0 || existingName.length > 0;
          if (existingHasMeaningfulData) {
            return;
          }
        }
      }

      const payload: PortfolioRecoverySnapshot = {
        holdings: normalizedHoldings,
        portfolioName: safeName,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to save account portfolio backup', error);
    }
  };

  const loadAccountPortfolioBackup = (userId: string): PortfolioRecoverySnapshot | null => {
    try {
      const raw = localStorage.getItem(getAccountPortfolioBackupKey(userId));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<PortfolioRecoverySnapshot>;
      const holdings = normalizePortfolioHoldings(parsed.holdings);
      const portfolioNameValue = typeof parsed.portfolioName === 'string' && parsed.portfolioName.trim()
        ? parsed.portfolioName.trim()
        : DEFAULT_PORTFOLIO_NAME;

      return {
        holdings,
        portfolioName: portfolioNameValue,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    } catch (error) {
      console.error('Failed to load account portfolio backup', error);
      return null;
    }
  };

  const getActiveDropdownAnchor = () => {
    if (typeof window === 'undefined') return desktopDropdownRef.current || mobileDropdownRef.current;
    return window.matchMedia('(min-width: 1024px)').matches
      ? desktopDropdownRef.current
      : mobileDropdownRef.current;
  };

  const scrollMobileFullFields = (direction: 'left' | 'right') => {
    const container = mobileFullFieldsScrollRef.current;
    if (!container) return;

    const amount = direction === 'right' ? 240 : -240;
    container.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // --- PERSISTENCE LOGIC ---
  const loadLocalPortfolio = (useExampleIfMissing = false) => {
    const saved = localStorage.getItem('my_portfolio');
    if (!saved) {
      if (useExampleIfMissing) {
        setStocks(defaultExamplePortfolio);
      } else {
        setStocks([]);
      }
      return false;
    }

    try {
      setStocks(JSON.parse(saved));
      return true;
    } catch (error) {
      console.error('Failed to load local portfolio:', error);
      setStocks(useExampleIfMissing ? defaultExamplePortfolio : []);
      return false;
    }
  };

  const loadLocalPortfolioName = () => {
    const savedName = localStorage.getItem(PORTFOLIO_NAME_KEY);
    if (savedName && savedName.trim()) {
      const trimmedName = savedName.trim();
      setPortfolioName(trimmedName);
      setEditNameBackup(trimmedName);
      return;
    }

    setPortfolioName(DEFAULT_PORTFOLIO_NAME);
    setEditNameBackup(DEFAULT_PORTFOLIO_NAME);
  };

  useEffect(() => {
    if (!isLoaded) return;

    const loadPortfolio = async () => {
      const signedInUserId = typeof user?.id === 'string' ? user.id : '';

      const restoreFromAccountBackup = () => {
        if (!signedInUserId) return false;
        const backup = loadAccountPortfolioBackup(signedInUserId);
        if (!backup) return false;

        setStocks(backup.holdings);
        setPortfolioName(backup.portfolioName);
        setEditNameBackup(backup.portfolioName);
        setSaveStatus('Recovered From Account Backup');
        setTimeout(() => setSaveStatus('Save Portfolio'), 2000);
        return true;
      };

      try {
        if (!isSignedIn) {
          loadLocalPortfolio(true);
          loadLocalPortfolioName();
          return;
        }

        const response = await fetch('/api/portfolio', { cache: 'no-store' });

        if (!response.ok) {
          if (restoreFromAccountBackup()) {
            return;
          }
          loadLocalPortfolio(false);
          loadLocalPortfolioName();
          return;
        }

        const data = await response.json();
        const accountPortfolioName = typeof data?.portfolioName === 'string' && data.portfolioName.trim()
          ? data.portfolioName.trim()
          : DEFAULT_PORTFOLIO_NAME;
        setPortfolioName(accountPortfolioName);
        setEditNameBackup(accountPortfolioName);

        if (Array.isArray(data?.holdings)) {
          const normalized = normalizePortfolioHoldings(data.holdings);
          setStocks(normalized);
          if (signedInUserId) {
            saveAccountPortfolioBackup(signedInUserId, normalized, accountPortfolioName);
          }
          return;
        }

        if (restoreFromAccountBackup()) {
          return;
        }

        loadLocalPortfolio(false);
      } catch (error) {
        console.error('Failed to load account portfolio:', error);
        if (restoreFromAccountBackup()) {
          return;
        }
        loadLocalPortfolio(false);
        loadLocalPortfolioName();
      } finally {
        setHasInitializedPortfolio(true);
      }
    };

    loadPortfolio();
  }, [isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    if (!isLoaded) return;

    const wasSignedIn = previousAuthStateRef.current;

    if (wasSignedIn && !isSignedIn) {
      try {
        localStorage.removeItem('my_portfolio');
        localStorage.removeItem(PORTFOLIO_NAME_KEY);

        const filingsKey = 'portfo_stock_analysis_filings_v1';
        const draftPrefix = 'portfo_stock_analysis_draft_v1_';
        const rawFilings = localStorage.getItem(filingsKey);

        if (rawFilings) {
          const parsed = JSON.parse(rawFilings) as Array<{ symbol?: string }>;
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (typeof item?.symbol === 'string' && item.symbol.trim()) {
                localStorage.removeItem(`${draftPrefix}${item.symbol.trim().toUpperCase()}`);
              }
            });
          }
        }

        const draftKeysToDelete: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && key.startsWith(draftPrefix)) {
            draftKeysToDelete.push(key);
          }
        }
        draftKeysToDelete.forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem(filingsKey);
      } catch (error) {
        console.error('Failed to clear account-specific local data on logout', error);
      }

      setStocks(defaultExamplePortfolio);
      setPortfolioName(DEFAULT_PORTFOLIO_NAME);
      setEditNameBackup(DEFAULT_PORTFOLIO_NAME);
      setIsEditing(false);
      setEditBackup([]);
      setShowDropdown(false);
      setShowMobileFullFields(false);
      setSuggestions([]);
      setNewSymbol('');
      setNewQuantity('');
      setNewBuyPrice('');
      setAddStatus('');
      setSaveStatus('Save Portfolio');
      setHasInitializedPortfolio(true);
    }

    previousAuthStateRef.current = isSignedIn;
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!hasInitializedPortfolio) return;
    localStorage.setItem('my_portfolio', JSON.stringify(stocks));
  }, [stocks, hasInitializedPortfolio]);

  useEffect(() => {
    if (!isLoaded || !hasInitializedPortfolio) return;
    const finalName = portfolioName.trim() || DEFAULT_PORTFOLIO_NAME;
    localStorage.setItem(PORTFOLIO_NAME_KEY, finalName);
  }, [portfolioName, isLoaded, hasInitializedPortfolio]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasInitializedPortfolio || !user?.id) return;
    const finalName = portfolioName.trim() || DEFAULT_PORTFOLIO_NAME;
    saveAccountPortfolioBackup(user.id, normalizePortfolioHoldings(stocks), finalName);
  }, [isLoaded, isSignedIn, hasInitializedPortfolio, user?.id, stocks, portfolioName]);

  const manualSave = async () => {
    setSaveStatus('Saving...');

    const finalPortfolioName = portfolioName.trim() || DEFAULT_PORTFOLIO_NAME;
    setPortfolioName(finalPortfolioName);
    setEditNameBackup(finalPortfolioName);

    if (isSignedIn && user?.id) {
      saveAccountPortfolioBackup(user.id, normalizePortfolioHoldings(stocks), finalPortfolioName);
    }

    let accountSaved = false;
    if (isSignedIn) {
      try {
        const response = await fetch('/api/portfolio', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holdings: stocks, portfolioName: finalPortfolioName }),
        });

        accountSaved = response.ok;
      } catch (error) {
        console.error('Failed to save account portfolio:', error);
      }
    }

    localStorage.setItem('my_portfolio', JSON.stringify(stocks));
    localStorage.setItem(PORTFOLIO_NAME_KEY, finalPortfolioName);
    setSaveStatus(
      isSignedIn
        ? accountSaved
          ? 'Saved To Account'
          : 'Saved Local Only'
        : 'Saved To Browser'
    );
    setIsEditing(false);
    setEditBackup([]);
    setTimeout(() => setSaveStatus('Save Portfolio'), 2000);
  };

  const toggleEditMode = () => {
    if (isEditing) {
      // Cancel - restore from backup
      setStocks(editBackup);
      setPortfolioName(editNameBackup);
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
      setEditNameBackup(portfolioName.trim() || DEFAULT_PORTFOLIO_NAME);
      setIsEditing(true);
    }
  };

  // --- ACTIONS & SEARCH ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedMobileInputArea = mobileDropdownRef.current?.contains(target);
      const clickedDesktopInputArea = desktopDropdownRef.current?.contains(target);
      const clickedDropdownMenu = dropdownMenuRef.current?.contains(target);

      if (!clickedMobileInputArea && !clickedDesktopInputArea && !clickedDropdownMenu) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showDropdown || suggestions.length === 0) {
      setDropdownStyle(null);
      return;
    }

    const updateDropdownPosition = () => {
      const anchor = getActiveDropdownAnchor();
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [showDropdown, suggestions.length, isEditing]);

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

  const displayPortfolioName = portfolioName.trim() || DEFAULT_PORTFOLIO_NAME;

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

  const dropdownPortal =
    showDropdown && suggestions.length > 0 && dropdownStyle
      ? createPortal(
          <div
            ref={dropdownMenuRef}
            className="fixed bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
              zIndex: 9999,
            }}
          >
            {suggestions.map((item) => (
              <button
                key={`suggest-${item.symbol}`}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-4 md:py-6 lg:py-4 px-3 md:pl-3 md:pr-5 font-sans text-slate-100 relative overflow-x-hidden">
      <div className="hidden lg:block fixed inset-y-0 left-0 w-[220px] bg-white/5 border-r border-white/10 backdrop-blur-sm pointer-events-none" />
      <div className="hidden lg:block fixed inset-y-0 right-0 w-[340px] bg-white/5 border-l border-white/10 backdrop-blur-sm pointer-events-none" />
      <div className="w-full relative z-10">
        
        {/* HEADER SECTION */}
        <div className="px-2 md:px-10 mb-4 md:mb-4 lg:mb-3">
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
                <div className="w-full px-3 py-2 rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-100 text-[11px] leading-relaxed">
                  Create an account to make your portfolio and save it to your account.
                </div>
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
                  <Link
                    href="/analysis"
                    className="w-full px-4 py-2.5 bg-blue-600 border border-blue-500 rounded-xl text-[12px] font-semibold text-white text-center hover:bg-blue-700 transition-all"
                  >
                    Stock Analysis
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
                  <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Portfolio Name</p>
                  {isEditing ? (
                    <input
                      type="text"
                      value={portfolioName}
                      onChange={(event) => setPortfolioName(event.target.value.slice(0, 60))}
                      placeholder={DEFAULT_PORTFOLIO_NAME}
                      className="w-[170px] px-2 py-1 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-lg text-[11px] font-semibold text-right focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-white truncate max-w-[160px] text-right">{displayPortfolioName}</p>
                  )}
                </div>
                <div className="h-px bg-white/10" />
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

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowMobileFullFields((prev) => !prev)}
                className="px-3 py-2 bg-white/10 border border-white/15 rounded-xl text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all"
              >
                {showMobileFullFields ? 'Hide Full Fields' : 'Show Full Fields (Scrollable)'}
              </button>

              {showMobileFullFields && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => scrollMobileFullFields('left')}
                    className="h-7 min-w-7 px-2 rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all"
                    aria-label="Scroll full fields left"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => scrollMobileFullFields('right')}
                    className="h-7 min-w-7 px-2 rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all"
                    aria-label="Scroll full fields right"
                  >
                    →
                  </button>
                </div>
              )}
            </div>

            <div
              ref={showMobileFullFields ? mobileFullFieldsScrollRef : undefined}
              className={`mt-3 ${showMobileFullFields ? 'overflow-x-auto overflow-y-visible' : 'overflow-visible'} relative z-30`}
            >
              <div className={`bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 backdrop-blur-md overflow-visible ${showMobileFullFields ? 'min-w-[980px]' : 'min-w-full'}`}>
                {showMobileFullFields ? (
                  <div className="grid grid-cols-12 px-4 py-3 text-[9px] font-semibold text-blue-200/80 uppercase tracking-[0.06em]">
                    <span className="col-span-2">Asset</span>
                    <span className="col-span-2 text-center">Avg Buy Price</span>
                    <span className="col-span-1 text-center">Qty</span>
                    <span className="col-span-2 text-right">Market Price</span>
                    <span className="col-span-2 text-center">24h</span>
                    <span className="col-span-1 text-right">Value</span>
                    <span className="col-span-2 text-right">Profit/Loss</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-12 px-4 pt-4 pb-3 text-[10px] font-semibold text-blue-200/80 uppercase tracking-[0.06em]">
                    <span className="col-span-5">Asset</span>
                    <span className="col-span-3 text-right">Total Equity</span>
                    <span className="col-span-4 text-right">P/L</span>
                  </div>
                )}

                <div className="divide-y divide-white/10">
                  {stocks.map((stock) =>
                    showMobileFullFields ? (
                      <div key={`mobile-full-row-${stock.symbol}`} className="px-4 py-3 hover:bg-white/5 transition-all group relative">
                        {isEditing && (
                          <button
                            onClick={() => removeStock(stock.symbol)}
                            className="absolute left-1 top-1/2 -translate-y-1/2 text-amber-200 hover:text-amber-100 transition-all text-[10px] p-1"
                          >
                            ✕
                          </button>
                        )}

                        <PriceDisplay symbol={stock.symbol} avgPrice={stock.avgPrice} quantity={stock.quantity} compact>
                          <div className="grid grid-cols-3 items-center justify-center gap-1">
                            {isEditing ? (
                              <div className="relative w-full col-span-2">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-200/80 font-bold text-[10px]">$</span>
                                <input
                                  type="number"
                                  value={stock.avgPrice || ''}
                                  onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                                  className="w-full pl-5 pr-2 py-1.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-lg font-semibold focus:outline-none focus:bg-amber-500/15 transition-all text-[11px]"
                                  placeholder="Avg"
                                />
                              </div>
                            ) : (
                              <span className="text-slate-100 font-bold col-span-2 text-center text-[11px]">${stock.avgPrice.toFixed(2)}</span>
                            )}

                            {isEditing ? (
                              <input
                                type="number"
                                placeholder="Qty"
                                value={stock.quantity || ''}
                                onChange={(e) => updateStock(stock.symbol, 'quantity', e.target.value)}
                                className="w-full px-1 py-1.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-lg font-semibold text-center focus:outline-none focus:bg-amber-500/15 transition-all text-[11px] col-span-1"
                              />
                            ) : (
                              <span className="text-slate-100 font-bold col-span-1 text-center text-[11px]">{stock.quantity}</span>
                            )}
                          </div>
                        </PriceDisplay>
                      </div>
                    ) : (
                      <div key={`mobile-row-${stock.symbol}`} className="px-4 py-4 hover:bg-white/5 transition-all group">
                        <PriceDisplay symbol={stock.symbol} avgPrice={stock.avgPrice} quantity={stock.quantity} mobileSummary>
                          {isEditing ? (
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-5 relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-200/80 font-bold text-[10px]">$</span>
                                <input
                                  type="number"
                                  value={stock.avgPrice || ''}
                                  onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                                  className="w-full pl-5 pr-2 py-1.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-lg font-semibold focus:outline-none focus:bg-amber-500/15 transition-all text-[11px]"
                                  placeholder="Avg"
                                />
                              </div>
                              <input
                                type="number"
                                placeholder="Qty"
                                value={stock.quantity || ''}
                                onChange={(e) => updateStock(stock.symbol, 'quantity', e.target.value)}
                                className="col-span-3 w-full px-2 py-1.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-lg font-semibold text-center focus:outline-none focus:bg-amber-500/15 transition-all text-[11px]"
                              />
                              <button
                                onClick={() => removeStock(stock.symbol)}
                                className="col-span-4 px-2 py-1.5 rounded-lg border border-amber-300/40 bg-amber-500/15 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/25 transition-all"
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </PriceDisplay>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-4">
              <div className="relative z-[90]" ref={mobileDropdownRef}>
                <p className="text-[12px] font-semibold tracking-[0.02em] text-amber-100 mb-2">Add or Merge Lot</p>
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="text"
                    placeholder="Ticker (e.g. IVV.AX)"
                    value={newSymbol}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    className="px-4 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-300"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Qty"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      className="px-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-300"
                    />
                    <input
                      type="number"
                      placeholder="Buy Price"
                      value={newBuyPrice}
                      onChange={(e) => setNewBuyPrice(e.target.value)}
                      className="px-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-300"
                    />
                  </div>
                  <button
                    onClick={addOrMergeHolding}
                    className="w-full px-3 py-2.5 bg-amber-500 text-slate-900 rounded-xl text-[12px] font-semibold hover:bg-amber-400 transition-all"
                  >
                    Add
                  </button>
                </div>

                {addStatus && <p className="mt-2 text-[11px] font-semibold text-amber-100">{addStatus}</p>}
              </div>
            </div>
          )}

          <div className="relative z-10 flex items-center justify-start gap-3">
            <button
              onClick={toggleEditMode}
              className={`px-5 py-2.5 border rounded-xl text-[12px] font-semibold transition-all ${
                isEditing
                  ? 'bg-amber-500 text-slate-900 border-amber-400 hover:bg-amber-400'
                  : 'bg-white/10 border-white/15 text-blue-100 hover:bg-white/15'
              }`}
            >
              {isEditing ? 'Cancel' : 'Edit Portfolio'}
            </button>

            {isEditing && (
              <button
                onClick={manualSave}
                className="px-5 py-2.5 bg-amber-500 text-slate-900 border border-amber-400 rounded-xl text-[12px] font-semibold hover:bg-amber-400 transition-all"
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
                <div className="w-full px-3 py-2 rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-100 text-[11px] leading-relaxed">
                  Create an account to make your portfolio and save it to your account.
                </div>
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
                  <Link
                    href="/analysis"
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all text-center"
                  >
                    Stock Analysis
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
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.08em] mb-2">Portfolio Name</p>
              {isEditing ? (
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(event) => setPortfolioName(event.target.value.slice(0, 60))}
                  placeholder={DEFAULT_PORTFOLIO_NAME}
                  className="w-full max-w-[420px] px-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-xl text-sm font-semibold focus:outline-none"
                />
              ) : (
                <p className="text-lg font-semibold text-white">{displayPortfolioName}</p>
              )}
            </div>

            <div className="overflow-x-auto overflow-y-visible relative z-30">
              <div className="bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 backdrop-blur-md overflow-visible min-w-[980px]">
              <div className="grid grid-cols-12 px-8 pt-7 pb-4 text-[11px] font-semibold text-blue-200/80 uppercase tracking-[0.08em]">
                <span className="col-span-2">Asset</span>
                <span className="col-span-2 text-center">Avg Buy Price</span>
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
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-200 hover:text-amber-100 transition-all text-xs p-2"
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
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-200/80 font-bold text-xs">$</span>
                            <input 
                              type="number"
                              value={stock.avgPrice || ''}
                              onChange={(e) => updateStock(stock.symbol, 'avgPrice', e.target.value)}
                              className="w-full pl-7 pr-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-xl font-semibold focus:outline-none focus:bg-amber-500/15 transition-all text-sm"
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
                            className="w-full px-2 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 focus:border-amber-300 rounded-xl font-semibold text-center focus:outline-none focus:bg-amber-500/15 transition-all text-sm col-span-1"
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
                  <div className="px-8 py-5 bg-amber-500/10 border-t border-amber-300/30">
                    <div className="relative z-[90]" ref={desktopDropdownRef}>
                      <p className="text-[12px] font-semibold tracking-[0.02em] text-amber-100 mb-2">Add or Merge Lot</p>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <input
                          type="text"
                          placeholder="Ticker (e.g. IVV.AX)"
                          value={newSymbol}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onFocus={() => setShowDropdown(true)}
                          className="col-span-1 md:col-span-5 px-4 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-300 shadow-sm transition-all"
                        />
                        <input
                          type="number"
                          placeholder="Qty"
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                          className="col-span-1 md:col-span-2 px-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold text-center focus:outline-none focus:border-amber-300 shadow-sm transition-all"
                        />
                        <input
                          type="number"
                          placeholder="Buy Price"
                          value={newBuyPrice}
                          onChange={(e) => setNewBuyPrice(e.target.value)}
                          className="col-span-1 md:col-span-3 px-3 py-2.5 bg-amber-500/10 text-amber-50 border border-amber-300/40 rounded-xl text-sm font-semibold text-center focus:outline-none focus:border-amber-300 shadow-sm transition-all"
                        />
                        <button
                          onClick={addOrMergeHolding}
                          className="col-span-1 md:col-span-2 px-3 py-2.5 bg-amber-500 text-slate-900 rounded-xl text-[12px] font-semibold hover:bg-amber-400 transition-all"
                        >
                          Add
                        </button>
                      </div>

                      <p className="mt-2 text-[11px] font-medium text-amber-100/85">
                        Enter quantity and buy price — average buy price updates automatically when merged.
                      </p>
                      {addStatus && <p className="mt-1 text-[11px] font-semibold text-amber-200">{addStatus}</p>}

                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>

            <div className="relative z-10 mt-5 flex items-center justify-start gap-3">
              <button
                onClick={toggleEditMode}
                className={`px-5 py-2.5 border rounded-xl text-[12px] font-semibold transition-all shadow-sm active:scale-95 ${
                  isEditing
                    ? 'bg-amber-500 text-slate-900 border-amber-400 hover:bg-amber-400'
                    : 'bg-white/10 border-white/15 text-blue-100 hover:bg-white/15'
                }`}
              >
                {isEditing ? 'Cancel' : 'Edit Portfolio'}
              </button>

              {isEditing && (
                <button
                  onClick={manualSave}
                  className="px-5 py-2.5 bg-amber-500 text-slate-900 border border-amber-400 rounded-xl text-[12px] font-semibold hover:bg-amber-400 transition-all shadow-sm active:scale-95"
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
                      <p className="text-[11px] text-blue-200 font-medium uppercase tracking-[0.08em]">Portfolio Name</p>
                      <p className="text-sm font-semibold text-white truncate max-w-[160px] text-right">{displayPortfolioName}</p>
                    </div>

                    <div className="h-px bg-white/10" />

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

              <div className="mt-4 rounded-xl border border-blue-300/30 bg-blue-500/10 p-4">
                <p className="text-[12px] font-semibold tracking-[0.02em] text-blue-50">Try Our Stock Analysis Write-Up Feature</p>
                <p className="mt-2 text-[11px] text-blue-100/85 leading-relaxed">
                  Build detailed bullish, base, and bearish write-ups for each stock in your filing table.
                </p>
                <Link
                  href="/analysis"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-blue-300/35 bg-blue-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-all hover:bg-blue-700"
                >
                  Open Stock Analysis
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
      {dropdownPortal}
    </div>
  );
}
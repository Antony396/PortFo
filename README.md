# Portfo - Stock Portfolio Tracker

A modern, professional stock portfolio tracking application built with Next.js 16, TypeScript, and Tailwind CSS. Track your stock holdings, monitor real-time prices, and manage your investment portfolio with ease.

## Features

**Real-time Stock Prices** - Fetches live stock quotes from Finnhub API
**Secure Authentication** - User authentication powered by Clerk
**Portfolio Management** - Add, remove, and track your stock holdings
**Comprehensive Analytics** - View gains/losses, percentages, and portfolio value
**Responsive Design** - Mobile-first UI built with Tailwind CSS
**Server-Side Rendering** - Optimized performance with Next.js App Router

## Tech Stack

- **Framework**: Next.js 16.1.6
- **Language**: TypeScript 5.9
- **Styling**: Tailwind CSS 4.2 + PostCSS
- **Authentication**: Clerk
- **Data Source**: Finnhub Stock API
- **UI Components**: Lucide React, class-variance-authority
- **Type Safety**: Strict TypeScript configuration

## Prerequisites

- Node.js 18+ and npm/yarn
- Finnhub API key (free tier available at [finnhub.io](https://finnhub.io))
- Clerk account (free tier available at [clerk.com](https://clerk.com))

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd portfo
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your API keys:

```bash
cp .env.example .env.local
```

Required environment variables:
- `FINNHUB_API_KEY` - Your Finnhub API key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes for data fetching
│   │   ├── price/        # Stock price endpoint
│   │   └── search/       # Stock search endpoint
│   ├── dashboard/        # Main portfolio dashboard
│   └── layout.tsx        # Root layout with Clerk provider
├── components/
│   └── portfolio/        # Portfolio UI components
├── services/
│   ├── finnhub.ts       # Finnhub API integration
│   └── database.ts      # Database layer (for future use)
├── lib/
│   ├── calculations.ts  # Portfolio calculation utilities
│   └── utils.ts         # General helper functions
├── types/
│   └── portfolio.d.ts   # TypeScript type definitions
└── middleware.ts        # Clerk authentication middleware
```

## API Endpoints

### Get Stock Price
`GET /api/price/[symbol]`

Returns current price, change, percent change, and company info for a stock symbol.

**Example**: `/api/price/AAPL`

### Search Stocks
`GET /api/search?q=[query]`

Searches for stocks matching the query.

**Example**: `/api/search?q=Apple`

## Development

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
npm start
```

## Features in Detail

### Portfolio Management
- View all registered stocks in your portfolio
- Track quantity and average cost basis
- Real-time profit/loss calculations
- Percentage change indicators

### Real-time Pricing
- Automatic price updates via Finnhub API
- Company logos and names displayed
- High/low price tracking
- Previous close price comparison

### Authentication
- Secure user authentication with Clerk
- Protected dashboard routes
- User-specific portfolio persistence
- Sign in/sign up pages

## Security Considerations

-  Middleware protection on authenticated routes
-  API keys stored in environment variables (never exposed to client)
-  TypeScript strict mode enabled
-  Input validation on all API endpoints
-  CORS-protected API routes

## Performance Optimizations

- Next.js App Router with server components
- Optimized data fetching with `revalidate` settings
- Client-side caching for company profiles
- Real-time price updates without full page refresh

## Future Enhancements

- [ ] Historical price charts and analytics
- [ ] Transaction history and cost basis tracking
- [ ] Portfolio performance benchmarking
- [ ] Watchlist functionality
- [ ] Price alerts and notifications
- [ ] Export portfolio data (CSV/PDF)
- [ ] Multi-currency support

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FINNHUB_API_KEY` | Finnhub stock data API key | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key | Yes |
| `DATABASE_URL` | Database connection string | No (future) |

## Troubleshooting

### "API Key is missing" error
- Ensure `.env.local` exists with `FINNHUB_API_KEY` set
- Restart the development server after adding env variables

### "Stock symbol not found"
- Verify the symbol is valid (e.g., AAPL, MSFT)
- Check Finnhub API status at [finnhub.io](https://finnhub.io)

### Authentication issues
- Verify Clerk keys are set correctly in `.env.local`
- Clear browser cookies and try again
- Check Clerk dashboard for user status

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Create a feature branch
2. Commit with clear messages
3. Push and create a pull request
4. Ensure tests pass and types check

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Check existing GitHub issues
- Create a new issue with detailed description
- Contact via email

---

**Last Updated**: March 2026

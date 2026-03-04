# Portfo - Stock Portfolio Tracker

A modern, professional stock portfolio tracking application built with Next.js 16, TypeScript, and Tailwind CSS. Track your stock holdings, monitor real-time prices, and manage your investment portfolio with ease.

## Features

**Real-time Stock Prices** - Fetches live stock quotes from Finnhub API
**Secure Authentication** - User authentication powered by Clerk
**Portfolio Management** - Add, remove, and track your stock holdings
**Account Cloud Save** - Signed-in users can load/save portfolios to Supabase
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

Optional environment variables (required only for account cloud save):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)

### 4. Run Development Server

```bash
npm run dev
```

If you hit a stale Next.js lock file on Windows, use:

```bash
npm run dev:clean
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
│   └── database.ts      # Supabase REST persistence helpers
├── lib/
│   ├── calculations.ts  # Portfolio calculation utilities
│   └── utils.ts         # General helper functions
├── types/
│   └── portfolio.d.ts   # TypeScript type definitions
└── proxy.ts             # Clerk route protection (Next.js proxy convention)
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

### Portfolio (Account Save)
`GET /api/portfolio`

Returns the signed-in user's saved holdings from Supabase. If Supabase is not configured, returns an empty portfolio.

`PUT /api/portfolio`

Saves the signed-in user's holdings to Supabase.

### Analysis Filings (Account Save)
`GET /api/analysis`

Returns the signed-in user's analysis filing rows (symbol/company/timestamps).

`PUT /api/analysis`

Upserts a filing row for a symbol (used by the filings table).

`GET /api/analysis/[symbol]`

Returns one filing row and its saved analysis draft.

`PUT /api/analysis/[symbol]`

Saves a symbol's analysis draft to the signed-in user's account.

`DELETE /api/analysis/[symbol]`

Deletes a symbol filing (and its draft) from the signed-in user's account.

### Health Check
`GET /api/health`

Returns deployment health and environment readiness without exposing secret values.

- `200` when core app environment variables are configured
- `503` when one or more required core variables are missing
- Includes `features.accountSave.ready` to indicate whether cloud save env vars are configured

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
- Public dashboard access with optional sign in
- User-specific cloud portfolio persistence when signed in
- Sign in/sign up pages

### Portfolio Persistence
- Guest users: portfolio is stored in browser localStorage
- Signed-in users: manual save writes to Supabase and browser localStorage
- Signed-in users: dashboard load prioritizes Supabase holdings
- Signed-in users: app also keeps account-scoped local recovery snapshots for holdings and analysis drafts
- If cloud sync is temporarily unavailable, signed-in pages auto-restore from latest account-scoped recovery snapshot

### Data Durability Safeguards
- Supabase REST requests now retry on transient failures (`408`, `425`, `429`, `500`, `502`, `503`, `504`)
- Portfolio and analysis pages maintain hidden per-account recovery backups in browser storage
- Empty cloud responses do not overwrite richer local recovery snapshots
- Logout reset still clears active-session local data, while account-scoped recovery snapshots remain available for that user’s future sign-in

## Security Considerations

-  Authenticated API checks on account-save endpoints
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
| `SUPABASE_URL` | Supabase project URL for account save | No* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for account save API | No* |

\* Required if you want signed-in account cloud save. Without these, the app still works with local browser storage.

## Supabase Setup (Account Save)

Create a `portfolios` table in Supabase SQL editor:

```sql
create table if not exists public.portfolios (
	user_id text primary key,
	holdings jsonb not null default '[]'::jsonb,
	updated_at timestamptz not null default now()
);

create table if not exists public.analysis_filings (
	user_id text not null,
	symbol text not null,
	company_name text not null default '',
	draft jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, symbol)
);
```

Then add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your `.env.local` (and Vercel project env vars for production).

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

### Verify deployment env configuration
- Open `/api/health` on your deployed app
- Confirm `status` is `ok`
- For cloud save, confirm `features.accountSave.ready` is `true`

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

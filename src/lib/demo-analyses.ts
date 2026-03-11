// Pre-seeded demo analysis filings.
// These appear in the public analysis search so the feature looks populated
// even before any real users have published reviews.
//
// Shape matches exactly what the filing editor produces when a user publishes:
//   - scenarioAnalyses: { growthRate, analysis } — no 'likelihood' field
//   - casesSummary: the main analysis write-up
//   - segments / epsHistory / epsPeMultiple: optional extras
//
// The special author ID 'portfo_demo' cannot clash with real Clerk user IDs
// (which always start with 'user_').

export const DEMO_AUTHOR_ID = 'portfo_demo';

type ScenarioKey = 'conservative' | 'base' | 'aggressive';

type ScenarioAnalysis = {
  growthRate: string;
  analysis: string;
};

type BusinessSegment = {
  name: string;
  revenue: string;
  operatingIncome: string;
  growth: string;
  growthBear?: string;
  growthBull?: string;
};

type EpsDataPoint = {
  year: string;
  eps: string;
};

type PublishedAnalysisFile = {
  symbol: string;
  companyName: string;
  publishedAt: string;
  scenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis>;
  casesSummary: string;
  activeScenario: ScenarioKey;
  savedDcfPrice: number | null;
  savedDcfAt: string;
  segments?: BusinessSegment[];
  epsHistory?: EpsDataPoint[];
  epsPeMultiple?: string;
};

type DemoReview = {
  review_user_id: string;
  symbol: string;
  company_name: string;
  author_label: string;
  published_at: string;
  updated_at: string;
  published_file: PublishedAnalysisFile;
};

export const DEMO_REVIEWS: DemoReview[] = [
  // ─── APPLE ────────────────────────────────────────────────────────────────
  {
    review_user_id: DEMO_AUTHOR_ID,
    symbol: 'AAPL',
    company_name: 'Apple Inc.',
    author_label: 'PortFo Demo',
    published_at: '2025-11-15T09:00:00.000Z',
    updated_at: '2025-11-15T09:00:00.000Z',
    published_file: {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      publishedAt: '2025-11-15T09:00:00.000Z',
      activeScenario: 'base',
      savedDcfPrice: 191.84,
      savedDcfAt: '2025-11-15T08:55:00.000Z',
      casesSummary:
`Apple's moat is its ecosystem lock-in — once you're in iCloud, AirPods, and Apple Watch it's genuinely painful to leave. Services (App Store, iCloud+, Apple TV+, Apple Pay) now make up ~25% of revenue but well over 35% of gross profit, and that mix keeps improving every year.

The main risk I see is that the iPhone upgrade cycle is stretching. People are keeping phones for 4-5 years now, which puts a ceiling on unit growth. China is also a real headwind — Huawei's Mate series has clawed back meaningful share in the premium segment, and there's regulatory pressure on Apple's App Store economics domestically.

On valuation: FCF was ~$110B in FY2024. At the current price you're paying roughly 27-28x FCF, which is fair if Services keeps compounding at 12-15% per year but leaves little margin of safety if iPhone disappoints. My DCF using 8% FCF growth, 10% discount rate, and 2.5% terminal growth gets me to ~$192.

I'm holding but not adding at these levels. Would get more interested sub-$165.`,
      scenarioAnalyses: {
        conservative: {
          growthRate: '0.04',
          analysis: '',
        },
        base: {
          growthRate: '0.08',
          analysis: '',
        },
        aggressive: {
          growthRate: '0.13',
          analysis: '',
        },
      },
      segments: [
        { name: 'iPhone', revenue: '201183000000', operatingIncome: '', growth: '0.04', growthBear: '0.01', growthBull: '0.08' },
        { name: 'Services', revenue: '96169000000', operatingIncome: '', growth: '0.13', growthBear: '0.09', growthBull: '0.18' },
        { name: 'Mac', revenue: '29984000000', operatingIncome: '', growth: '0.05', growthBear: '0.02', growthBull: '0.09' },
        { name: 'iPad', revenue: '26694000000', operatingIncome: '', growth: '0.03', growthBear: '0.00', growthBull: '0.07' },
        { name: 'Wearables & Accessories', revenue: '37005000000', operatingIncome: '', growth: '0.05', growthBear: '0.02', growthBull: '0.10' },
      ],
      epsHistory: [
        { year: '2020', eps: '3.28' },
        { year: '2021', eps: '5.61' },
        { year: '2022', eps: '6.11' },
        { year: '2023', eps: '6.13' },
        { year: '2024', eps: '6.08' },
      ],
      epsPeMultiple: '28',
    },
  },

  // ─── MICROSOFT ────────────────────────────────────────────────────────────
  {
    review_user_id: DEMO_AUTHOR_ID,
    symbol: 'MSFT',
    company_name: 'Microsoft Corporation',
    author_label: 'PortFo Demo',
    published_at: '2025-11-15T09:05:00.000Z',
    updated_at: '2025-11-15T09:05:00.000Z',
    published_file: {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      publishedAt: '2025-11-15T09:05:00.000Z',
      activeScenario: 'base',
      savedDcfPrice: 443.20,
      savedDcfAt: '2025-11-15T08:55:00.000Z',
      casesSummary:
`Microsoft is probably the single best-positioned large-cap for the AI transition. They already had dominant distribution through Office 365 and Azure, and now they're layering Copilot on top of both. The OpenAI relationship gives them a head start that competitors will struggle to match in the next 2-3 years.

Azure growing at 28-30% in a market this size is remarkable. The key driver right now is AI workloads — every enterprise LLM deployment basically defaults to Azure OpenAI because procurement teams already have the security review done. That's a huge structural advantage.

FCF was ~$74B in FY2024 and growing fast. At 30x FCF the stock looks roughly fair, but I think you can justify a premium for the quality and predictability. My DCF (12% growth, 9% discount, 3% terminal) gets me to ~$443.

The bear case is that Copilot 365 renewal rates disappoint once the novelty wears off — enterprises pay for the pilot, don't see enough productivity gain, and churn out. That would compress the multiple quickly. Worth watching the next 1-2 renewal cycles closely.`,
      scenarioAnalyses: {
        conservative: {
          growthRate: '0.05',
          analysis: '',
        },
        base: {
          growthRate: '0.12',
          analysis: '',
        },
        aggressive: {
          growthRate: '0.18',
          analysis: '',
        },
      },
      segments: [
        { name: 'Intelligent Cloud (Azure)', revenue: '105360000000', operatingIncome: '', growth: '0.22', growthBear: '0.12', growthBull: '0.32' },
        { name: 'Productivity & Business (Office)', revenue: '77698000000', operatingIncome: '', growth: '0.12', growthBear: '0.07', growthBull: '0.18' },
        { name: 'More Personal Computing (Windows/Xbox)', revenue: '59655000000', operatingIncome: '', growth: '0.04', growthBear: '0.01', growthBull: '0.07' },
      ],
      epsHistory: [
        { year: '2020', eps: '5.76' },
        { year: '2021', eps: '8.05' },
        { year: '2022', eps: '9.65' },
        { year: '2023', eps: '9.81' },
        { year: '2024', eps: '11.45' },
      ],
      epsPeMultiple: '32',
    },
  },

  // ─── NVIDIA ────────────────────────────────────────────────────────────────
  {
    review_user_id: DEMO_AUTHOR_ID,
    symbol: 'NVDA',
    company_name: 'NVIDIA Corporation',
    author_label: 'PortFo Demo',
    published_at: '2025-11-15T09:10:00.000Z',
    updated_at: '2025-11-15T09:10:00.000Z',
    published_file: {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      publishedAt: '2025-11-15T09:10:00.000Z',
      activeScenario: 'base',
      savedDcfPrice: 134.70,
      savedDcfAt: '2025-11-15T08:55:00.000Z',
      casesSummary:
`NVIDIA is in a category of its own right now. The H100/H200 and now Blackwell GPUs are essentially the bottleneck for every serious AI workload on the planet, and CUDA's 15-year head start means nobody is switching away just to save money. Data centre revenue went from ~$15B in FY2023 to over $100B in FY2025 — that kind of inflection is almost unprecedented for a company this size.

The CUDA moat is what makes this more than just a hardware cycle story. Every ML engineer learns PyTorch or JAX on CUDA. Every model checkpoint is optimised for CUDA. Switching to AMD or custom silicon means rewriting software stacks that took years to build — most teams won't bother.

FCB was ~$53B in FY2025 (Jan). My DCF uses 28% growth for 9 years, 10% discount, 3% terminal — that gets me ~$135. The stock is not cheap on any traditional metric but I think the moat justifies a premium.

Biggest risks: US export restrictions tightening further on China (already cost them ~$15B ARR), hyperscalers building custom silicon (Google TPU, Amazon Trainium) taking a slice of training workloads, and a broader AI capex cycle slowdown if ROI from LLM deployments disappoints. I'd size this position accordingly — great business, but you're paying for a lot of future growth already.`,
      scenarioAnalyses: {
        conservative: {
          growthRate: '0.15',
          analysis: '',
        },
        base: {
          growthRate: '0.28',
          analysis: '',
        },
        aggressive: {
          growthRate: '0.45',
          analysis: '',
        },
      },
      segments: [
        { name: 'Data Centre', revenue: '115162000000', operatingIncome: '', growth: '0.30', growthBear: '0.15', growthBull: '0.50' },
        { name: 'Gaming', revenue: '11288000000', operatingIncome: '', growth: '0.08', growthBear: '0.02', growthBull: '0.14' },
        { name: 'Professional Visualisation', revenue: '1874000000', operatingIncome: '', growth: '0.10', growthBear: '0.04', growthBull: '0.18' },
        { name: 'Automotive', revenue: '1695000000', operatingIncome: '', growth: '0.40', growthBear: '0.20', growthBull: '0.70' },
      ],
      epsHistory: [
        { year: '2021', eps: '1.22' },
        { year: '2022', eps: '1.32' },
        { year: '2023', eps: '1.74' },
        { year: '2024', eps: '12.96' },
        { year: '2025', eps: '29.76' },
      ],
      epsPeMultiple: '35',
    },
  },
];

/** Look up a demo review by ticker symbol (case-insensitive). */
export function getDemoReview(symbol: string): DemoReview | undefined {
  const upper = symbol.toUpperCase();
  return DEMO_REVIEWS.find((r) => r.symbol === upper);
}

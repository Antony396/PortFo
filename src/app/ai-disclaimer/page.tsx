import Link from 'next/link';

export default function AIDisclaimerPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-12 px-4 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black tracking-tight">AI Disclaimer</h1>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-white/10 border border-white/15 rounded-xl text-sm font-semibold text-blue-50 hover:bg-white/15 transition-all"
          >
            Back
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-5 text-sm leading-relaxed text-blue-100/90">
          <p>
            PoPo bot is provided for general informational purposes only and may generate incomplete or inaccurate output.
          </p>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Not Financial Advice</h2>
            <p>
              AI responses are not financial, investment, legal, accounting, or tax advice. You are solely responsible for
              your investment decisions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Model Limitations</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>AI output can be incorrect, outdated, or not suitable for your risk profile.</li>
              <li>Market conditions change quickly and can invalidate suggestions.</li>
              <li>You should independently verify key facts before acting.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">No Guarantees</h2>
            <p>
              PortFo makes no guarantees regarding investment outcomes, returns, or the completeness of AI-generated
              responses.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Use at Your Own Risk</h2>
            <p>
              By using PoPo bot, you acknowledge these limitations and agree that you remain fully responsible for any
              actions taken.
            </p>
          </section>

          <p className="text-xs text-blue-200/70">Last updated: March 3, 2026</p>
        </div>
      </div>
    </div>
  );
}

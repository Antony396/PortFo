import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-12 px-4 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-white/10 border border-white/15 rounded-xl text-sm font-semibold text-blue-50 hover:bg-white/15 transition-all"
          >
            Back
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md space-y-5 text-sm leading-relaxed text-blue-100/90">
          <p>
            This policy explains how PortFo collects, uses, and protects your information when you use this application.
          </p>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account details from authentication provider (Clerk), such as user ID and email.</li>
              <li>Portfolio data you enter (tickers, quantity, average price, and related inputs).</li>
              <li>AI helper prompts and responses for product functionality and improvement.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">How We Use Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate portfolio tracking, valuation tools, and AI helper features.</li>
              <li>To improve app reliability, performance, and user experience.</li>
              <li>To maintain security and prevent abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Data Sharing</h2>
            <p>
              We do not sell your personal data. Data may be processed by service providers used to run this app (for example,
              authentication, hosting, and market-data services), subject to their own terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Data Retention</h2>
            <p>
              Portfolio and usage data are retained as needed to provide the service, comply with legal obligations, and
              maintain security.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Your Choices</h2>
            <p>
              You may update or remove portfolio entries directly in the app. For account-related requests, use your account
              controls or contact the app operator.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-blue-50 mb-2">Contact</h2>
            <p>
              For privacy requests or questions, contact the app owner through your project support channel.
            </p>
          </section>

          <p className="text-xs text-blue-200/70">Last updated: March 3, 2026</p>
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from 'next/server';

function isPresent(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getMissingVariables(variableNames: string[]) {
  return variableNames.filter((name) => !isPresent(process.env[name]));
}

export async function GET() {
  const requiredBaseVariables = [
    'FINNHUB_API_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
  ];
  const optionalAccountSaveVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

  const missingBaseVariables = getMissingVariables(requiredBaseVariables);
  const missingAccountSaveVariables = getMissingVariables(optionalAccountSaveVariables);

  const baseReady = missingBaseVariables.length === 0;
  const accountSaveReady = missingAccountSaveVariables.length === 0;

  const payload = {
    status: baseReady ? 'ok' : 'degraded',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    features: {
      app: {
        ready: baseReady,
        missing: missingBaseVariables,
      },
      accountSave: {
        ready: accountSaveReady,
        missing: missingAccountSaveVariables,
      },
    },
  };

  return NextResponse.json(payload, { status: baseReady ? 200 : 503 });
}

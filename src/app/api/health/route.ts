import { NextResponse } from 'next/server';

function isPresent(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getMissingVariables(variableNames: string[]) {
  return variableNames.filter((name) => !isPresent(process.env[name]));
}

async function probeSupabaseConnection() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isPresent(supabaseUrl) || !isPresent(supabaseServiceRoleKey)) {
    return { ok: false, reason: 'not-configured' as const };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/portfolios?select=user_id&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseServiceRoleKey as string,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        reason: 'query-failed' as const,
        status: response.status,
      };
    }

    return { ok: true, reason: 'connected' as const };
  } catch {
    return { ok: false, reason: 'network-error' as const };
  }
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
  const accountSaveProbe = await probeSupabaseConnection();

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
        connection: accountSaveProbe,
      },
    },
  };

  return NextResponse.json(payload, { status: baseReady ? 200 : 503 });
}

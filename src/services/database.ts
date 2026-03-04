export type PortfolioStock = {
	symbol: string;
	quantity: number;
	avgPrice: number;
};

export type PortfolioRecord = {
	holdings: PortfolioStock[];
	portfolioName: string;
};

export type AnalysisFilingRow = {
	symbol: string;
	company_name: string;
	created_at: string;
	updated_at: string;
	draft?: unknown;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function getHeaders() {
	return {
		apikey: supabaseServiceRoleKey as string,
		Authorization: `Bearer ${supabaseServiceRoleKey}`,
		'Content-Type': 'application/json',
	};
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3) {
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			const response = await fetch(url, init);
			const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1;
			if (!shouldRetry) {
				return response;
			}
		} catch (error) {
			if (attempt >= maxAttempts - 1) {
				throw error;
			}
		}

		const delayMs = Math.min(250 * 2 ** attempt, 1000);
		await wait(delayMs);
	}

	throw new Error('Failed to complete Supabase request after retries');
}

export function isDatabaseConfigured() {
	return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export async function getPortfolioByUserId(userId: string): Promise<PortfolioRecord | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const query = `${supabaseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error('Failed to fetch portfolio from database');
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return {
			holdings: [],
			portfolioName: '',
		};
	}

	const row = rows[0] as { holdings?: unknown; portfolio_name?: unknown };
	const holdings = Array.isArray(row?.holdings) ? row.holdings as PortfolioStock[] : [];
	const portfolioName = typeof row?.portfolio_name === 'string' ? row.portfolio_name : '';

	return {
		holdings,
		portfolioName,
	};
}

export async function upsertPortfolioByUserId(userId: string, holdings: PortfolioStock[], portfolioName?: string) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const postPayload = async (payload: Record<string, unknown>) => {
		return fetchWithRetry(`${supabaseUrl}/rest/v1/portfolios?on_conflict=user_id`, {
			method: 'POST',
			headers: {
				...getHeaders(),
				Prefer: 'resolution=merge-duplicates,return=minimal',
			},
			body: JSON.stringify([payload]),
		});
	};

	const basePayload: Record<string, unknown> = {
		user_id: userId,
		holdings,
	};

	const normalizedPortfolioName = typeof portfolioName === 'string' ? portfolioName.trim() : '';
	let response = await postPayload(
		normalizedPortfolioName
			? {
				...basePayload,
				portfolio_name: normalizedPortfolioName,
			}
			: basePayload,
	);

	if (!response.ok && normalizedPortfolioName) {
		const errorText = (await response.text()).toLowerCase();
		if (errorText.includes('portfolio_name')) {
			response = await postPayload(basePayload);
		}
	}

	if (!response.ok) {
		throw new Error('Failed to save portfolio to database');
	}

	return true;
}

export async function getAnalysisFilingsByUserId(userId: string): Promise<AnalysisFilingRow[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const query = `${supabaseUrl}/rest/v1/analysis_filings?user_id=eq.${encodeURIComponent(userId)}&select=symbol,company_name,created_at,updated_at,draft&order=updated_at.desc`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error('Failed to fetch analysis filings from database');
	}

	const rows = await response.json();
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows;
}

export async function getAnalysisFilingByUserIdAndSymbol(userId: string, symbol: string): Promise<AnalysisFilingRow | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const query = `${supabaseUrl}/rest/v1/analysis_filings?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}&select=symbol,company_name,created_at,updated_at,draft&limit=1`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error('Failed to fetch analysis filing from database');
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}

	return rows[0] as AnalysisFilingRow;
}

export async function upsertAnalysisFilingByUserId(
	userId: string,
	params: {
		symbol: string;
		companyName: string;
		draft?: unknown;
	},
) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = params.symbol.trim().toUpperCase();
	const companyName = params.companyName.trim() || normalizedSymbol;
	const payload: {
		user_id: string;
		symbol: string;
		company_name: string;
		updated_at: string;
		draft?: unknown;
	} = {
		user_id: userId,
		symbol: normalizedSymbol,
		company_name: companyName,
		updated_at: new Date().toISOString(),
	};

	if (params.draft !== undefined) {
		payload.draft = params.draft;
	}

	const response = await fetchWithRetry(`${supabaseUrl}/rest/v1/analysis_filings?on_conflict=user_id,symbol`, {
		method: 'POST',
		headers: {
			...getHeaders(),
			Prefer: 'resolution=merge-duplicates,return=representation',
		},
		body: JSON.stringify([payload]),
	});

	if (!response.ok) {
		throw new Error('Failed to save analysis filing to database');
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}

	return rows[0] as AnalysisFilingRow;
}

export async function deleteAnalysisFilingByUserIdAndSymbol(userId: string, symbol: string) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const response = await fetchWithRetry(
		`${supabaseUrl}/rest/v1/analysis_filings?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}`,
		{
			method: 'DELETE',
			headers: {
				...getHeaders(),
				Prefer: 'return=minimal',
			},
		},
	);

	if (!response.ok) {
		throw new Error('Failed to delete analysis filing from database');
	}

	return true;
}

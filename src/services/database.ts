export type PortfolioStock = {
	symbol: string;
	quantity: number;
	avgPrice: number;
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

function getHeaders() {
	return {
		apikey: supabaseServiceRoleKey as string,
		Authorization: `Bearer ${supabaseServiceRoleKey}`,
		'Content-Type': 'application/json',
	};
}

export function isDatabaseConfigured() {
	return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export async function getPortfolioByUserId(userId: string): Promise<PortfolioStock[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const query = `${supabaseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(userId)}&select=holdings&limit=1`;
	const response = await fetch(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error('Failed to fetch portfolio from database');
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return [];
	}

	const holdings = rows[0]?.holdings;
	return Array.isArray(holdings) ? holdings : [];
}

export async function upsertPortfolioByUserId(userId: string, holdings: PortfolioStock[]) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const response = await fetch(`${supabaseUrl}/rest/v1/portfolios?on_conflict=user_id`, {
		method: 'POST',
		headers: {
			...getHeaders(),
			Prefer: 'resolution=merge-duplicates,return=minimal',
		},
		body: JSON.stringify([
			{
				user_id: userId,
				holdings,
			},
		]),
	});

	if (!response.ok) {
		throw new Error('Failed to save portfolio to database');
	}

	return true;
}

export async function getAnalysisFilingsByUserId(userId: string): Promise<AnalysisFilingRow[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const query = `${supabaseUrl}/rest/v1/analysis_filings?user_id=eq.${encodeURIComponent(userId)}&select=symbol,company_name,created_at,updated_at&order=updated_at.desc`;
	const response = await fetch(query, {
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
	const response = await fetch(query, {
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

	const response = await fetch(`${supabaseUrl}/rest/v1/analysis_filings?on_conflict=user_id,symbol`, {
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
	const response = await fetch(
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

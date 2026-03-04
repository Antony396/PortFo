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

export type PublicAnalysisReviewRow = {
	review_user_id: string;
	symbol: string;
	company_name: string;
	author_label: string;
	published_at: string;
	updated_at: string;
	published_file?: unknown;
};

export type PublicAnalysisReviewVoteRow = {
	review_user_id: string;
	symbol: string;
	voter_user_id: string;
	vote: number;
	created_at: string;
	updated_at: string;
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

async function buildSupabaseErrorMessage(response: Response, fallbackMessage: string) {
	let details = '';
	try {
		details = (await response.text()).trim();
	} catch {
		details = '';
	}

	if (!details) {
		return `${fallbackMessage} (status ${response.status})`;
	}

	return `${fallbackMessage} (status ${response.status}): ${details}`;
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

export async function upsertPublicAnalysisReviewByUserId(
	userId: string,
	params: {
		symbol: string;
		companyName: string;
		authorLabel?: string;
		publishedFile: unknown;
		publishedAt?: string;
	},
) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = params.symbol.trim().toUpperCase();
	const companyName = params.companyName.trim() || normalizedSymbol;
	const now = new Date().toISOString();

	const payload = {
		review_user_id: userId,
		symbol: normalizedSymbol,
		company_name: companyName,
		author_label: (params.authorLabel || '').trim(),
		published_file: params.publishedFile,
		published_at: params.publishedAt || now,
		updated_at: now,
	};

	const response = await fetchWithRetry(`${supabaseUrl}/rest/v1/analysis_public_reviews?on_conflict=review_user_id,symbol`, {
		method: 'POST',
		headers: {
			...getHeaders(),
			Prefer: 'resolution=merge-duplicates,return=representation',
		},
		body: JSON.stringify([payload]),
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to save public analysis review to database'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}

	return rows[0] as PublicAnalysisReviewRow;
}

export async function getPublicAnalysisReviewsBySymbol(symbol: string, limit = 25): Promise<PublicAnalysisReviewRow[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	if (!normalizedSymbol) {
		return [];
	}

	const normalizedLimit = Math.max(1, Math.min(limit, 50));
	const query = `${supabaseUrl}/rest/v1/analysis_public_reviews?symbol=eq.${encodeURIComponent(normalizedSymbol)}&select=review_user_id,symbol,company_name,author_label,published_at,updated_at,published_file&order=published_at.desc&limit=${normalizedLimit}`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to fetch public analysis reviews from database'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows as PublicAnalysisReviewRow[];
}

export async function getPublicAnalysisReviewByUserIdAndSymbol(reviewUserId: string, symbol: string): Promise<PublicAnalysisReviewRow | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const query = `${supabaseUrl}/rest/v1/analysis_public_reviews?review_user_id=eq.${encodeURIComponent(reviewUserId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}&select=review_user_id,symbol,company_name,author_label,published_at,updated_at,published_file&limit=1`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to fetch public analysis review from database'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}

	return rows[0] as PublicAnalysisReviewRow;
}

export async function deletePublicAnalysisReviewByUserIdAndSymbol(reviewUserId: string, symbol: string) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const response = await fetchWithRetry(
		`${supabaseUrl}/rest/v1/analysis_public_reviews?review_user_id=eq.${encodeURIComponent(reviewUserId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}`,
		{
			method: 'DELETE',
			headers: {
				...getHeaders(),
				Prefer: 'return=minimal',
			},
		},
	);

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to delete public analysis review from database'));
	}

	return true;
}

export async function getPublicAnalysisReviewVotesBySymbol(symbol: string): Promise<PublicAnalysisReviewVoteRow[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const query = `${supabaseUrl}/rest/v1/analysis_public_review_votes?symbol=eq.${encodeURIComponent(normalizedSymbol)}&select=review_user_id,symbol,voter_user_id,vote,created_at,updated_at`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to fetch public review votes from database'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows as PublicAnalysisReviewVoteRow[];
}

export async function getPublicAnalysisReviewVotesByReview(reviewUserId: string, symbol: string): Promise<PublicAnalysisReviewVoteRow[] | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}

	const normalizedSymbol = symbol.trim().toUpperCase();
	const query = `${supabaseUrl}/rest/v1/analysis_public_review_votes?review_user_id=eq.${encodeURIComponent(reviewUserId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}&select=review_user_id,symbol,voter_user_id,vote,created_at,updated_at`;
	const response = await fetchWithRetry(query, {
		method: 'GET',
		headers: getHeaders(),
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to fetch public review vote summary from database'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows as PublicAnalysisReviewVoteRow[];
}

export async function upsertPublicAnalysisReviewVote(params: {
	reviewUserId: string;
	symbol: string;
	voterUserId: string;
	vote: 1 | -1;
}) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = params.symbol.trim().toUpperCase();
	const now = new Date().toISOString();
	const payload = {
		review_user_id: params.reviewUserId,
		symbol: normalizedSymbol,
		voter_user_id: params.voterUserId,
		vote: params.vote,
		updated_at: now,
	};

	const response = await fetchWithRetry(`${supabaseUrl}/rest/v1/analysis_public_review_votes?on_conflict=review_user_id,symbol,voter_user_id`, {
		method: 'POST',
		headers: {
			...getHeaders(),
			Prefer: 'resolution=merge-duplicates,return=representation',
		},
		body: JSON.stringify([payload]),
	});

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to upsert public analysis review vote'));
	}

	const rows = await response.json();
	if (!Array.isArray(rows) || rows.length === 0) {
		return null;
	}

	return rows[0] as PublicAnalysisReviewVoteRow;
}

export async function deletePublicAnalysisReviewVote(params: {
	reviewUserId: string;
	symbol: string;
	voterUserId: string;
}) {
	if (!isDatabaseConfigured()) {
		return false;
	}

	const normalizedSymbol = params.symbol.trim().toUpperCase();
	const response = await fetchWithRetry(
		`${supabaseUrl}/rest/v1/analysis_public_review_votes?review_user_id=eq.${encodeURIComponent(params.reviewUserId)}&symbol=eq.${encodeURIComponent(normalizedSymbol)}&voter_user_id=eq.${encodeURIComponent(params.voterUserId)}`,
		{
			method: 'DELETE',
			headers: {
				...getHeaders(),
				Prefer: 'return=minimal',
			},
		},
	);

	if (!response.ok) {
		throw new Error(await buildSupabaseErrorMessage(response, 'Failed to delete public analysis review vote'));
	}

	return true;
}

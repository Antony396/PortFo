export type PortfolioStock = {
	symbol: string;
	quantity: number;
	avgPrice: number;
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

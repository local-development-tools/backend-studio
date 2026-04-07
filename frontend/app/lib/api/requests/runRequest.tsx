import { API_BASE_URL } from '~/lib/api/config';

export interface RunRequestResult {
	requestId: string;
	ok: boolean;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	durationMs: number;
	bodyText?: string;
	bodyJson?: unknown;
	error?: string;
}

export async function runRequest(id: string): Promise<RunRequestResult[]> {
	const response = await fetch(`${API_BASE_URL}/requests/${id}/run`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`HTTP error status: ${response.status}`);
	}

	const payload = (await response.json()) as RunRequestResult[] | RunRequestResult;

	if (Array.isArray(payload)) {
		return payload;
	}

	return [payload];
}

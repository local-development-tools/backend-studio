	import { API_BASE_URL } from '~/lib/api/config';

	export interface ApiRequest {
		id: string;
		name: string;
		method: string;
		url: string;
		headers?: Record<string, string>;
		body?: string;
		collectionId?: string;
		folderId?: string;
		createdAt: string;
		updatedAt: string;
	}

	export async function getRequestById(id: string): Promise<ApiRequest> {
		const response = await fetch(`${API_BASE_URL}/requests/${id}`);

		if (!response.ok) {
			throw new Error(`HTTP error status: ${response.status}`);
		}

		return (await response.json()) as ApiRequest;
	}

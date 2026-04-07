import { API_BASE_URL } from '~/lib/api/config';

export interface ApiRequest {
	id: string;
	type: 'http' | 'grpc';
	name: string;
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: unknown;
	serverAddress?: string;
	service?: string;
	protoContent?: string;
	message?: unknown;
	metadata?: Record<string, string>;
	collectionId?: string;
	folderId?: string;
	createdAt: string;
	updatedAt: string;
}

export async function listRootRequests(): Promise<ApiRequest[]> {
	const response = await fetch(`${API_BASE_URL}/requests`);

	if (!response.ok) {
		throw new Error(`HTTP error status: ${response.status}`);
	}

	return (await response.json()) as ApiRequest[];
}

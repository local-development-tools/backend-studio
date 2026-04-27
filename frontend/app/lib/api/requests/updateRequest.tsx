import { API_BASE_URL } from '~/lib/api/config';

export interface UpdateRequestPayload {
	type?: 'http' | 'grpc';
	name?: string;
	method?: string;
	url?: string;
	headers?: Record<string, string>;
	body?: unknown;
	serverAddress?: string;
	service?: string;
	protoContent?: string;
	message?: unknown;
	metadata?: Record<string, string>;
	postScript?: string;
	collectionId?: string;
	folderId?: string;
}

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

export async function updateRequest(id: string, payload: UpdateRequestPayload): Promise<ApiRequest> {
	const response = await fetch(`${API_BASE_URL}/requests/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`HTTP error status: ${response.status}`);
	}

	return (await response.json()) as ApiRequest;
}

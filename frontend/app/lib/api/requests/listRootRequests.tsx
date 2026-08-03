import { API_BASE_URL } from '~/lib/api/config';
import type { BodyMode } from '~/components/requests/types';

export interface ApiRequest {
	id: string;
	type: 'http' | 'grpc';
	name: string;
	method: string;
	url: string;
	pathParams?: Record<string, string>;
	headers?: Record<string, string>;
	body?: unknown;
	bodyMode?: BodyMode;
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

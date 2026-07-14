import { getApiBaseUrl } from '../utils/api';

export class ApiError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

interface FetchOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
	const baseUrl = getApiBaseUrl();
	const url = `${baseUrl}${path}`;

	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	if (!response.ok) {
		let message = `${response.status} ${response.statusText}`;
		try {
			const error = await response.json();
			if (error.error) {
				message = error.error;
			}
		} catch {
			// Use default message
		}
		throw new ApiError(response.status, response.statusText, message);
	}

	// Handle 204 No Content
	if (response.status === 204) {
		return undefined as T;
	}

	return response.json() as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
	return request<T>(path, { method: 'GET' });
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
	return request<T>(path, {
		method: 'POST',
		body: body ? JSON.stringify(body) : undefined,
	});
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

export async function del<T>(path: string): Promise<T> {
	return request<T>(path, { method: 'DELETE' });
}

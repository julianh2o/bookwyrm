import { get, post } from './client';
import type { ReadarrInstance, ReadarrInstancesResponse, TestConnectionResponse } from '../types';

/**
 * Get all configured Readarr instances
 */
export async function getInstances(): Promise<ReadarrInstance[]> {
	const response = await get<ReadarrInstancesResponse>('/api/settings/readarr');
	return response.instances;
}

/**
 * Test connection to a Readarr instance
 */
export async function testConnection(instanceId: string): Promise<TestConnectionResponse> {
	return post<TestConnectionResponse>(`/api/settings/readarr/${instanceId}/test`);
}

/**
 * Get instances for a specific category
 */
export function filterInstancesByCategory(
	instances: ReadarrInstance[],
	category: 'fiction' | 'nonfiction',
): ReadarrInstance[] {
	return instances.filter((i) => i.category === category && i.enabled);
}

/**
 * Get instances by type (audio/ebook)
 */
export function filterInstancesByType(instances: ReadarrInstance[], type: 'audio' | 'ebook'): ReadarrInstance[] {
	return instances.filter((i) => i.type === type && i.enabled);
}

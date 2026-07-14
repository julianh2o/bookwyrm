import fs from 'fs';
import path from 'path';

export type ReadarrType = 'audio' | 'ebook';
export type BookCategory = 'fiction' | 'nonfiction';

export interface ReadarrInstance {
	id: string;
	name: string;
	url: string;
	apiKey: string;
	type: ReadarrType;
	category: BookCategory;
	enabled: boolean;
}

export interface ReadarrConfig {
	instances: ReadarrInstance[];
}

let cachedConfig: ReadarrConfig | null = null;

/**
 * Load Readarr configuration from JSON file.
 * Configuration is cached after first load.
 */
export function loadReadarrConfig(): ReadarrConfig {
	if (cachedConfig) {
		return cachedConfig;
	}

	const configPath = process.env.READARR_CONFIG_PATH || path.join(process.cwd(), 'config', 'readarr.json');

	if (!fs.existsSync(configPath)) {
		throw new Error(
			`Readarr configuration not found at ${configPath}. ` +
				`Copy config/readarr.example.json to config/readarr.json and add your API keys.`,
		);
	}

	const rawConfig = fs.readFileSync(configPath, 'utf-8');
	const config = JSON.parse(rawConfig) as ReadarrConfig;

	// Validate config structure
	validateConfig(config);

	cachedConfig = config;
	return config;
}

/**
 * Get all enabled Readarr instances
 */
export function getEnabledInstances(): ReadarrInstance[] {
	const config = loadReadarrConfig();
	return config.instances.filter((i) => i.enabled);
}

/**
 * Get instances matching the given criteria
 */
export function getInstancesFor(category: BookCategory, type?: ReadarrType): ReadarrInstance[] {
	const instances = getEnabledInstances();
	return instances.filter((i) => i.category === category && (type === undefined || i.type === type));
}

/**
 * Get a specific instance by ID
 */
export function getInstanceById(id: string): ReadarrInstance | undefined {
	const config = loadReadarrConfig();
	return config.instances.find((i) => i.id === id);
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
	cachedConfig = null;
}

function validateConfig(config: unknown): asserts config is ReadarrConfig {
	if (!config || typeof config !== 'object') {
		throw new Error('Invalid Readarr config: expected an object');
	}

	const cfg = config as Record<string, unknown>;
	if (!Array.isArray(cfg.instances)) {
		throw new Error('Invalid Readarr config: missing instances array');
	}

	const seenIds = new Set<string>();
	for (const instance of cfg.instances) {
		validateInstance(instance, seenIds);
	}
}

function validateInstance(instance: unknown, seenIds: Set<string>): asserts instance is ReadarrInstance {
	if (!instance || typeof instance !== 'object') {
		throw new Error('Invalid Readarr instance: expected an object');
	}

	const inst = instance as Record<string, unknown>;

	if (typeof inst.id !== 'string' || !inst.id) {
		throw new Error('Invalid Readarr instance: missing or invalid id');
	}

	if (seenIds.has(inst.id)) {
		throw new Error(`Duplicate Readarr instance id: ${inst.id}`);
	}
	seenIds.add(inst.id);

	if (typeof inst.name !== 'string' || !inst.name) {
		throw new Error(`Invalid Readarr instance ${inst.id}: missing or invalid name`);
	}

	if (typeof inst.url !== 'string' || !inst.url.startsWith('http')) {
		throw new Error(`Invalid Readarr instance ${inst.id}: missing or invalid url`);
	}

	if (typeof inst.apiKey !== 'string' || !inst.apiKey) {
		throw new Error(`Invalid Readarr instance ${inst.id}: missing or invalid apiKey`);
	}

	if (inst.type !== 'audio' && inst.type !== 'ebook') {
		throw new Error(`Invalid Readarr instance ${inst.id}: type must be 'audio' or 'ebook'`);
	}

	if (inst.category !== 'fiction' && inst.category !== 'nonfiction') {
		throw new Error(`Invalid Readarr instance ${inst.id}: category must be 'fiction' or 'nonfiction'`);
	}

	if (typeof inst.enabled !== 'boolean') {
		throw new Error(`Invalid Readarr instance ${inst.id}: enabled must be a boolean`);
	}
}

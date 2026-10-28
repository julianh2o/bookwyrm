/**
 * Types for Readarr API responses
 */

export interface ReadarrRating {
	votes: number;
	value: number;
	popularity: number;
}

export interface ReadarrImage {
	url: string;
	coverType: string;
	extension: string;
	remoteUrl?: string;
}

export interface ReadarrLink {
	url: string;
	name: string;
}

export interface ReadarrStatistics {
	bookFileCount: number;
	bookCount: number;
	availableBookCount?: number;
	totalBookCount: number;
	sizeOnDisk: number;
	percentOfBooks: number;
}

export interface ReadarrAuthor {
	id?: number;
	authorMetadataId: number;
	status: string;
	ended: boolean;
	authorName: string;
	authorNameLastFirst: string;
	foreignAuthorId: string;
	titleSlug: string;
	overview?: string;
	links: ReadarrLink[];
	images: ReadarrImage[];
	remotePoster?: string;
	path?: string;
	qualityProfileId: number;
	metadataProfileId: number;
	monitored: boolean;
	monitorNewItems: string;
	folder?: string;
	genres: string[];
	cleanName: string;
	sortName: string;
	sortNameLastFirst: string;
	tags: number[];
	added: string;
	ratings: ReadarrRating;
	statistics?: ReadarrStatistics;
}

export interface ReadarrEdition {
	id?: number;
	bookId: number;
	foreignEditionId: string;
	titleSlug: string;
	isbn13?: string;
	asin?: string;
	title: string;
	overview?: string;
	format?: string;
	isEbook?: boolean;
	publisher?: string;
	pageCount?: number;
	releaseDate?: string;
	images: ReadarrImage[];
	links: ReadarrLink[];
	ratings: ReadarrRating;
	monitored: boolean;
	manualAdd: boolean;
	grabbed?: boolean;
}

export interface ReadarrBook {
	id?: number;
	title: string;
	authorTitle: string;
	seriesTitle: string;
	disambiguation: string;
	authorId: number;
	foreignBookId: string;
	foreignEditionId?: string;
	titleSlug: string;
	monitored: boolean;
	anyEditionOk: boolean;
	ratings: ReadarrRating;
	releaseDate?: string;
	pageCount: number;
	genres: string[];
	author?: ReadarrAuthor;
	editions?: ReadarrEdition[];
	images: ReadarrImage[];
	links: ReadarrLink[];
	statistics?: ReadarrStatistics;
	added: string;
	remoteCover?: string;
	grabbed?: boolean;
	addOptions?: ReadarrAddBookOptions;
}

export interface ReadarrAddAuthorOptions {
	monitor: 'all' | 'future' | 'missing' | 'existing' | 'first' | 'latest' | 'none';
	booksToMonitor?: string[];
	monitored: boolean;
	searchForMissingBooks: boolean;
}

export interface ReadarrAddAuthorRequest {
	authorName: string;
	foreignAuthorId: string;
	qualityProfileId: number;
	metadataProfileId: number;
	path: string;
	monitored: boolean;
	monitorNewItems: string;
	tags: number[];
	addOptions: ReadarrAddAuthorOptions;
}

export interface ReadarrAddBookOptions {
	addType?: 'automatic' | 'manual';
	searchForNewBook?: boolean;
}

export interface ReadarrCommand {
	name: string;
	authorId?: number;
	bookIds?: number[];
}

export interface ReadarrCommandResponse {
	id: number;
	name: string;
	commandName: string;
	status: string;
	queued: string;
	started?: string;
	ended?: string;
	stateChangeTime: string;
	sendUpdatesToClient: boolean;
	updateScheduledTask: boolean;
	priority: string;
}

export interface ReadarrSystemStatus {
	version: string;
	appName: string;
	instanceName?: string;
	buildTime?: string;
	isDebug?: boolean;
	isProduction?: boolean;
	isDocker?: boolean;
	branch?: string;
}

export interface ReadarrQualityProfile {
	id: number;
	name: string;
}

export interface ReadarrMetadataProfile {
	id: number;
	name: string;
}

export interface ReadarrRootFolder {
	id: number;
	path: string;
	accessible: boolean;
	freeSpace: number;
}

export interface ReadarrStatusMessage {
	title: string;
	messages: string[];
}

export interface ReadarrQueueItem {
	id: number;
	bookId?: number | null;
	authorId?: number | null;
	title: string;
	size: number;
	sizeleft: number;
	status: string; // queued, downloading, paused, completed, failed, warning, delay...
	trackedDownloadStatus?: string; // ok, warning, error
	trackedDownloadState?: string; // downloading, importPending, importing, imported, importBlocked, importFailed, failedPending, failed
	statusMessages?: ReadarrStatusMessage[];
	errorMessage?: string | null;
	downloadId?: string;
	outputPath?: string;
	downloadClient?: string;
	estimatedCompletionTime?: string;
	quality?: unknown;
}

export interface ReadarrPaged<T> {
	page: number;
	pageSize: number;
	totalRecords: number;
	records: T[];
}

export interface ReadarrHistoryItem {
	id: number;
	bookId: number;
	authorId: number;
	sourceTitle: string;
	date: string;
	downloadId?: string;
	eventType: string; // grabbed, downloadFailed, bookFileImported, bookImportIncomplete, downloadImported, ...
	data?: Record<string, string | null>;
}

export interface ReadarrManualImportItem {
	id?: number;
	path: string;
	name?: string;
	size?: number;
	author?: { id: number } | null;
	book?: { id: number } | null;
	foreignEditionId?: string | null;
	quality: unknown;
	releaseGroup?: string | null;
	downloadId?: string;
	indexerFlags?: number;
	additionalFile?: boolean;
	replaceExistingFiles?: boolean;
	disableReleaseSwitching?: boolean;
	rejections: Array<{ reason: string; type: string }>;
}

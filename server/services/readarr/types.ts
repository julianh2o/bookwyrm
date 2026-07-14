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

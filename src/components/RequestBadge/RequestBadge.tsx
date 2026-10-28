import React, { useState } from 'react';
import { Box, Tooltip, CircularProgress, Typography, Link, Divider } from '@mui/material';
import {
	CheckCircle as AvailableIcon,
	Search as SearchingIcon,
	Schedule as PendingIcon,
	ErrorOutline as ErrorIcon,
	HourglassEmpty as WantedIcon,
	Download as DownloadingIcon,
	MoveToInbox as ImportingIcon,
	Add as AddIcon,
} from '@mui/icons-material';
import type {
	ReadarrInstance,
	BookRequestResponse,
	BookRequestStatus,
	BookRequestPhase,
	RequestEvent,
} from '../../types';
import { getRequestEvents } from '../../api';

export interface RequestBadgeProps {
	instance: ReadarrInstance;
	request?: BookRequestResponse;
	/** Retry the phase the request is stuck in */
	onRetry?: (request: BookRequestResponse) => Promise<void>;
	/** Request the book from this instance (no request yet) */
	onAdd?: (instanceId: string) => Promise<void>;
}

type Tone = 'success' | 'info' | 'warning' | 'error' | 'neutral';

const STATUS_UI: Record<BookRequestStatus, { label: string; tone: Tone; Icon: typeof AvailableIcon }> = {
	pending: { label: 'Queued', tone: 'neutral', Icon: PendingIcon },
	adding: { label: 'Adding to Readarr', tone: 'info', Icon: PendingIcon },
	searching: { label: 'Searching', tone: 'info', Icon: SearchingIcon },
	found: { label: 'Searching', tone: 'info', Icon: SearchingIcon },
	wanted: { label: 'Wanted', tone: 'warning', Icon: WantedIcon },
	downloading: { label: 'Downloading', tone: 'info', Icon: DownloadingIcon },
	importing: { label: 'Importing', tone: 'info', Icon: ImportingIcon },
	available: { label: 'Available', tone: 'success', Icon: AvailableIcon },
	not_found: { label: 'Not found', tone: 'error', Icon: ErrorIcon },
	error: { label: 'Error', tone: 'error', Icon: ErrorIcon },
};

const PHASE_LABEL: Record<BookRequestPhase, string> = {
	add: 'Add to Readarr',
	search: 'Search',
	download: 'Download',
	import: 'Import',
	available: 'Done',
};

const RETRY_HINT: Record<BookRequestPhase, string> = {
	add: 'Click to try adding it to Readarr again',
	search: 'Click to search again',
	download: 'Click to drop this download, blocklist the release and search again',
	import: 'Click to import the downloaded files as this book',
	available: '',
};

const RETRYABLE: BookRequestStatus[] = ['error', 'not_found', 'wanted'];

export function instanceShortLabel(instance: ReadarrInstance): string {
	return `${instance.category === 'fiction' ? 'F' : 'NF'}${instance.type === 'audio' ? 'A' : 'E'}`;
}

export function timeAgo(iso: string | null | undefined): string {
	if (!iso) return 'never';
	const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
	return `${Math.round(seconds / 86400)}d ago`;
}

function readarrUrl(instance: ReadarrInstance, slug: string): string {
	return `${instance.url.replace(/\/$/, '')}/book/${slug}`;
}

const toneColor = (tone: Tone) =>
	tone === 'neutral' ? 'text.secondary' : tone === 'warning' ? 'warning.main' : `${tone}.main`;

export function RequestBadge({ instance, request, onRetry, onAdd }: RequestBadgeProps) {
	const [busy, setBusy] = useState(false);
	const [events, setEvents] = useState<RequestEvent[] | null>(null);

	const label = instanceShortLabel(instance);

	if (!request) {
		const handleAdd = async () => {
			if (!onAdd || busy) return;
			setBusy(true);
			try {
				await onAdd(instance.id);
			} finally {
				setBusy(false);
			}
		};
		return (
			<Tooltip title={`${instance.name}: not requested. Click to request it.`} arrow>
				<Box
					component='button'
					type='button'
					onClick={handleAdd}
					aria-label={`Request from ${instance.name}`}
					sx={{ ...badgeSx, borderStyle: 'dashed', color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
					<span>{label}</span>
					{busy ? <CircularProgress size={12} /> : <AddIcon sx={{ fontSize: 14 }} />}
				</Box>
			</Tooltip>
		);
	}

	const ui = STATUS_UI[request.status] ?? STATUS_UI.error;
	const phase = request.phase ?? 'add';
	const canRetry = !!onRetry && RETRYABLE.includes(request.status);
	const inFlight = request.status === 'adding' || request.status === 'pending' || busy;
	const progress =
		request.status === 'downloading' && request.progress != null ? Math.round(request.progress * 100) : null;

	const handleClick = async (e: React.MouseEvent) => {
		if (request.status === 'available' && request.externalSlug) {
			window.open(readarrUrl(instance, request.externalSlug), '_blank', 'noopener');
			return;
		}
		if (!canRetry || busy) return;
		e.stopPropagation();
		setBusy(true);
		try {
			await onRetry!(request);
			setEvents(null);
		} finally {
			setBusy(false);
		}
	};

	const loadEvents = () => {
		if (events) return;
		getRequestEvents(request.id)
			.then(setEvents)
			.catch(() => setEvents([]));
	};

	const tooltip = (
		<Box sx={{ p: 0.5, maxWidth: 340 }}>
			<Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
				{instance.name}
			</Typography>
			<Typography variant='body2'>
				{PHASE_LABEL[phase]} · {ui.label}
				{progress != null ? ` ${progress}%` : ''}
			</Typography>
			{request.errorMessage && (
				<Typography variant='body2' sx={{ color: 'error.light', mt: 0.5, wordBreak: 'break-word' }}>
					{request.errorMessage}
				</Typography>
			)}
			<Typography variant='caption' sx={{ display: 'block', opacity: 0.7, mt: 0.5 }}>
				Checked {timeAgo(request.lastChecked)}
				{request.attempts > 0 ? ` · ${request.attempts} attempt${request.attempts === 1 ? '' : 's'}` : ''}
			</Typography>
			{events && events.length > 0 && (
				<>
					<Divider sx={{ my: 0.75, borderColor: 'rgba(255,255,255,0.2)' }} />
					{events.slice(0, 5).map((ev) => (
						<Typography
							key={ev.id}
							variant='caption'
							sx={{
								display: 'block',
								color: ev.level === 'error' ? 'error.light' : 'inherit',
								wordBreak: 'break-word',
							}}>
							{timeAgo(ev.createdAt)}: {ev.message}
						</Typography>
					))}
				</>
			)}
			{(canRetry || request.externalSlug) && <Divider sx={{ my: 0.75, borderColor: 'rgba(255,255,255,0.2)' }} />}
			{canRetry && (
				<Typography variant='caption' sx={{ display: 'block', fontWeight: 600 }}>
					{RETRY_HINT[phase]}
				</Typography>
			)}
			{request.status === 'available' && (
				<Typography variant='caption' sx={{ display: 'block', fontWeight: 600 }}>
					Click to open in Readarr
				</Typography>
			)}
			{request.externalSlug && request.status !== 'available' && (
				<Link
					href={readarrUrl(instance, request.externalSlug)}
					target='_blank'
					rel='noopener noreferrer'
					variant='caption'
					sx={{ color: 'info.light' }}>
					Open in Readarr
				</Link>
			)}
		</Box>
	);

	return (
		<Tooltip title={tooltip} arrow onOpen={loadEvents} disableInteractive={false} enterDelay={250}>
			<Box
				component='button'
				type='button'
				onClick={handleClick}
				data-status={request.status}
				data-phase={phase}
				aria-label={`${instance.name}: ${ui.label}`}
				sx={{
					...badgeSx,
					borderColor: toneColor(ui.tone),
					color: toneColor(ui.tone),
					cursor: canRetry || request.status === 'available' ? 'pointer' : 'default',
					bgcolor: ui.tone === 'error' ? 'rgba(244,67,54,0.08)' : 'transparent',
				}}>
				<span>{label}</span>
				{inFlight || request.status === 'searching' ? (
					<CircularProgress size={12} color='inherit' />
				) : progress != null ? (
					<CircularProgress size={12} color='inherit' variant='determinate' value={Math.max(progress, 5)} />
				) : (
					<ui.Icon sx={{ fontSize: 14 }} />
				)}
			</Box>
		</Tooltip>
	);
}

const badgeSx = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 0.5,
	px: 0.75,
	py: 0.25,
	minWidth: 52,
	justifyContent: 'space-between',
	border: '1px solid',
	borderColor: 'divider',
	borderRadius: 1.5,
	bgcolor: 'transparent',
	font: 'inherit',
	fontSize: '0.75rem',
	fontWeight: 600,
	lineHeight: 1.6,
	cursor: 'pointer',
};

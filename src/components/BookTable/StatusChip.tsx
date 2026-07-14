import { Chip } from '@mui/material';
import type { BookRequestStatus, BookRequestResponse } from '../../types';

interface StatusChipProps {
	requests: BookRequestResponse[];
}

type AggregateStatus = 'none' | 'pending' | 'searching' | 'partial' | 'available' | 'error';

function getAggregateStatus(requests: BookRequestResponse[]): AggregateStatus {
	if (requests.length === 0) return 'none';

	const statuses = requests.map((r) => r.status);

	// If all available, show available
	if (statuses.every((s) => s === 'available')) return 'available';

	// If any error, show error
	if (statuses.some((s) => s === 'error')) return 'error';

	// If any searching/downloading, show searching
	if (statuses.some((s) => s === 'searching' || s === 'downloading' || s === 'found')) return 'searching';

	// If any available but not all, show partial
	if (statuses.some((s) => s === 'available')) return 'partial';

	// If all pending, show pending
	if (statuses.every((s) => s === 'pending')) return 'pending';

	// Default to pending
	return 'pending';
}

const STATUS_CONFIG: Record<
	AggregateStatus,
	{ label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }
> = {
	none: { label: 'No Requests', color: 'default' },
	pending: { label: 'Pending', color: 'default' },
	searching: { label: 'Searching', color: 'info' },
	partial: { label: 'Partial', color: 'warning' },
	available: { label: 'Available', color: 'success' },
	error: { label: 'Error', color: 'error' },
};

export function StatusChip({ requests }: StatusChipProps) {
	const status = getAggregateStatus(requests);
	const config = STATUS_CONFIG[status];

	return <Chip label={config.label} color={config.color} size='small' sx={{ minWidth: 80 }} />;
}

export function getStatusSortValue(requests: BookRequestResponse[]): number {
	const status = getAggregateStatus(requests);
	const order: Record<AggregateStatus, number> = {
		error: 0,
		searching: 1,
		pending: 2,
		partial: 3,
		available: 4,
		none: 5,
	};
	return order[status];
}

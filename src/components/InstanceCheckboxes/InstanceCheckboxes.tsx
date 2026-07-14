import React from 'react';
import { Box, Checkbox, Tooltip, CircularProgress } from '@mui/material';
import {
	CheckCircle as AvailableIcon,
	Search as SearchingIcon,
	Schedule as PendingIcon,
	Error as ErrorIcon,
	HelpOutline as NotFoundIcon,
	Download as DownloadingIcon,
} from '@mui/icons-material';
import type { ReadarrInstance, BookRequestResponse, BookRequestStatus } from '../../types';

interface InstanceCheckboxesProps {
	/** Available Readarr instances */
	instances: ReadarrInstance[];
	/** Currently selected instance IDs */
	selectedIds: string[];
	/** Request status for each instance (by instanceId) */
	requestStatus?: Record<string, BookRequestResponse>;
	/** Called when selection changes (for new book creation) */
	onChange?: (selectedIds: string[]) => void;
	/** Called when adding to an instance (for existing books) */
	onAdd?: (instanceId: string) => void;
	/** Whether the checkboxes are disabled */
	disabled?: boolean;
	/** Whether we're currently processing */
	loading?: boolean;
	/** Instance ID currently being processed */
	processingInstanceId?: string;
}

const STATUS_ICONS: Record<BookRequestStatus, React.ReactNode> = {
	pending: <PendingIcon fontSize='small' sx={{ color: 'text.secondary' }} />,
	searching: <SearchingIcon fontSize='small' sx={{ color: 'info.main' }} />,
	found: <SearchingIcon fontSize='small' sx={{ color: 'info.main' }} />,
	downloading: <DownloadingIcon fontSize='small' sx={{ color: 'info.main' }} />,
	available: <AvailableIcon fontSize='small' sx={{ color: 'success.main' }} />,
	not_found: <NotFoundIcon fontSize='small' sx={{ color: 'warning.main' }} />,
	error: <ErrorIcon fontSize='small' sx={{ color: 'error.main' }} />,
};

const STATUS_LABELS: Record<BookRequestStatus, string> = {
	pending: 'Pending',
	searching: 'Searching',
	found: 'Found',
	downloading: 'Downloading',
	available: 'Available',
	not_found: 'Not Found',
	error: 'Error',
};

function getInstanceLabel(instance: ReadarrInstance): string {
	// Short labels: FA (Fiction Audio), FE (Fiction Ebook), etc.
	const categoryLetter = instance.category === 'fiction' ? 'F' : 'NF';
	const typeLetter = instance.type === 'audio' ? 'A' : 'E';
	return `${categoryLetter}${typeLetter}`;
}

function getInstanceTooltip(instance: ReadarrInstance, status?: BookRequestResponse): string {
	let tooltip = instance.name;
	if (status) {
		tooltip += ` - ${STATUS_LABELS[status.status]}`;
		if (status.errorMessage) {
			tooltip += `: ${status.errorMessage}`;
		}
		if (status.externalSlug) {
			tooltip += ' (click to open in Readarr)';
		}
	}
	return tooltip;
}

function getReadarrBookUrl(instance: ReadarrInstance, slug: string): string {
	const baseUrl = instance.url.replace(/\/$/, '');
	return `${baseUrl}/book/${slug}`;
}

export function InstanceCheckboxes({
	instances,
	selectedIds,
	requestStatus = {},
	onChange,
	onAdd,
	disabled = false,
	loading = false,
	processingInstanceId,
}: InstanceCheckboxesProps) {
	const handleToggle = (instanceId: string) => {
		const isSelected = selectedIds.includes(instanceId);

		// If onAdd is provided and this is an unchecked instance, use onAdd
		if (onAdd && !isSelected) {
			onAdd(instanceId);
			return;
		}

		// Otherwise, use onChange for selection toggle (if provided)
		if (onChange) {
			if (isSelected) {
				onChange(selectedIds.filter((id) => id !== instanceId));
			} else {
				onChange([...selectedIds, instanceId]);
			}
		}
	};

	return (
		<Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
			{instances.map((instance) => {
				const isSelected = selectedIds.includes(instance.id);
				const status = requestStatus[instance.id];
				const hasStatus = !!status;
				const isProcessing = processingInstanceId === instance.id;
				const isAnyProcessing = loading || !!processingInstanceId;

				// For existing books with onAdd: only disable if already selected or processing
				// For new books with onChange: use standard disabled logic
				const isDisabled = onAdd
					? !instance.enabled || isSelected || isAnyProcessing
					: disabled || !instance.enabled || isAnyProcessing;

				return (
					<Tooltip key={instance.id} title={getInstanceTooltip(instance, status)} arrow>
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 0,
								px: 0.5,
								py: 0.25,
								borderRadius: 1,
								bgcolor: isSelected ? 'action.selected' : 'transparent',
								opacity: instance.enabled ? 1 : 0.5,
							}}>
							<Checkbox
								size='small'
								checked={isSelected}
								onChange={() => handleToggle(instance.id)}
								disabled={isDisabled}
								sx={{ p: 0.25 }}
							/>
							<Box
								component='span'
								sx={{
									fontSize: '0.75rem',
									fontWeight: 500,
									color: 'text.secondary',
									minWidth: '24px',
								}}>
								{getInstanceLabel(instance)}
							</Box>
							{isProcessing ? (
								<CircularProgress size={14} sx={{ ml: 0.5 }} />
							) : loading && isSelected ? (
								<CircularProgress size={14} sx={{ ml: 0.5 }} />
							) : hasStatus ? (
								status.externalSlug ? (
									<Box
										component='a'
										href={getReadarrBookUrl(instance, status.externalSlug)}
										target='_blank'
										rel='noopener noreferrer'
										onClick={(e) => e.stopPropagation()}
										sx={{
											ml: 0.5,
											display: 'flex',
											alignItems: 'center',
											cursor: 'pointer',
											'&:hover': { opacity: 0.7 },
										}}>
										{STATUS_ICONS[status.status]}
									</Box>
								) : (
									<Box sx={{ ml: 0.5, display: 'flex', alignItems: 'center' }}>{STATUS_ICONS[status.status]}</Box>
								)
							) : null}
						</Box>
					</Tooltip>
				);
			})}
		</Box>
	);
}

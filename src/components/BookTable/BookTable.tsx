import { useState } from 'react';
import {
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	IconButton,
	Tooltip,
	Box,
	CircularProgress,
} from '@mui/material';
import { PlayArrow as RequestIcon, Sync as SyncIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { BookWithRequests, ReadarrInstance, BookRequestResponse } from '../../types';
import { EditableCell } from './EditableCell';
import { StatusChip } from './StatusChip';
import { InstanceCheckboxes } from '../InstanceCheckboxes';

interface BookTableProps {
	books: BookWithRequests[];
	instances: ReadarrInstance[];
	onUpdateBook: (id: string, updates: { title?: string; author?: string }) => Promise<void>;
	onDeleteBook: (id: string) => Promise<void>;
	onProcessRequests: (id: string) => Promise<void>;
	onSyncStatus: (id: string) => Promise<void>;
	onAddToInstance: (bookId: string, instanceId: string) => Promise<void>;
	loading?: boolean;
}

export function BookTable({
	books,
	instances,
	onUpdateBook,
	onDeleteBook,
	onProcessRequests,
	onSyncStatus,
	onAddToInstance,
	loading = false,
}: BookTableProps) {
	const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
	const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	// Track which book+instance combo is being added
	const [addingInstance, setAddingInstance] = useState<{ bookId: string; instanceId: string } | null>(null);

	const handleTitleSave = async (bookId: string, title: string) => {
		await onUpdateBook(bookId, { title });
	};

	const handleAuthorSave = async (bookId: string, author: string) => {
		await onUpdateBook(bookId, { author });
	};

	const handleProcessRequests = async (bookId: string) => {
		setProcessingIds((prev) => new Set(prev).add(bookId));
		try {
			await onProcessRequests(bookId);
		} finally {
			setProcessingIds((prev) => {
				const next = new Set(prev);
				next.delete(bookId);
				return next;
			});
		}
	};

	const handleSyncStatus = async (bookId: string) => {
		setSyncingIds((prev) => new Set(prev).add(bookId));
		try {
			await onSyncStatus(bookId);
		} finally {
			setSyncingIds((prev) => {
				const next = new Set(prev);
				next.delete(bookId);
				return next;
			});
		}
	};

	const handleDelete = async (bookId: string) => {
		setDeletingIds((prev) => new Set(prev).add(bookId));
		try {
			await onDeleteBook(bookId);
		} finally {
			setDeletingIds((prev) => {
				const next = new Set(prev);
				next.delete(bookId);
				return next;
			});
		}
	};

	const handleAddToInstance = async (bookId: string, instanceId: string) => {
		setAddingInstance({ bookId, instanceId });
		try {
			await onAddToInstance(bookId, instanceId);
		} finally {
			setAddingInstance(null);
		}
	};

	const getRequestStatusMap = (requests: BookRequestResponse[]): Record<string, BookRequestResponse> => {
		const map: Record<string, BookRequestResponse> = {};
		for (const req of requests) {
			map[req.instanceId] = req;
		}
		return map;
	};

	const getSelectedInstanceIds = (requests: BookRequestResponse[]): string[] => {
		return requests.map((r) => r.instanceId);
	};

	const hasPendingRequests = (requests: BookRequestResponse[]): boolean => {
		return requests.some((r) => r.status === 'pending');
	};

	const hasInProgressRequests = (requests: BookRequestResponse[]): boolean => {
		return requests.some((r) => r.status === 'searching' || r.status === 'downloading');
	};

	if (loading) {
		return (
			<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<TableContainer component={Paper} sx={{ bgcolor: 'background.paper' }}>
			<Table size='small'>
				<TableHead>
					<TableRow>
						<TableCell sx={{ fontWeight: 600, width: '30%' }}>Title</TableCell>
						<TableCell sx={{ fontWeight: 600, width: '25%' }}>Author</TableCell>
						<TableCell sx={{ fontWeight: 600, width: '200px' }}>Instances</TableCell>
						<TableCell sx={{ fontWeight: 600, width: '100px' }}>Status</TableCell>
						<TableCell sx={{ fontWeight: 600, width: '120px' }} align='right'>
							Actions
						</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{books.length === 0 ? (
						<TableRow>
							<TableCell colSpan={5} align='center' sx={{ py: 4, color: 'text.secondary' }}>
								No books yet. Add one above!
							</TableCell>
						</TableRow>
					) : (
						books.map((book) => {
							const isProcessing = processingIds.has(book.id);
							const isSyncing = syncingIds.has(book.id);
							const isDeleting = deletingIds.has(book.id);
							const isBusy = isProcessing || isSyncing || isDeleting;

							return (
								<TableRow
									key={book.id}
									sx={{
										'&:hover': { bgcolor: 'action.hover' },
										opacity: isDeleting ? 0.5 : 1,
									}}>
									<TableCell>
										<EditableCell
											value={book.title}
											onSave={(title) => handleTitleSave(book.id, title)}
											placeholder='Enter title'
											disabled={isBusy}
										/>
									</TableCell>
									<TableCell>
										<EditableCell
											value={book.author}
											onSave={(author) => handleAuthorSave(book.id, author)}
											placeholder='Enter author'
											disabled={isBusy}
										/>
									</TableCell>
									<TableCell>
										<InstanceCheckboxes
											instances={instances.filter((i) => i.category === book.category)}
											selectedIds={getSelectedInstanceIds(book.requests)}
											requestStatus={getRequestStatusMap(book.requests)}
											onAdd={(instanceId) => handleAddToInstance(book.id, instanceId)}
											loading={isProcessing}
											processingInstanceId={addingInstance?.bookId === book.id ? addingInstance.instanceId : undefined}
										/>
									</TableCell>
									<TableCell>
										<StatusChip requests={book.requests} />
									</TableCell>
									<TableCell align='right'>
										<Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
											<Tooltip title='Process pending requests'>
												<span>
													<IconButton
														size='small'
														onClick={() => handleProcessRequests(book.id)}
														disabled={isBusy || !hasPendingRequests(book.requests)}
														color='primary'>
														{isProcessing ? <CircularProgress size={18} /> : <RequestIcon fontSize='small' />}
													</IconButton>
												</span>
											</Tooltip>
											<Tooltip title='Sync status with Readarr'>
												<span>
													<IconButton
														size='small'
														onClick={() => handleSyncStatus(book.id)}
														disabled={isBusy || !hasInProgressRequests(book.requests)}
														color='info'>
														{isSyncing ? <CircularProgress size={18} /> : <SyncIcon fontSize='small' />}
													</IconButton>
												</span>
											</Tooltip>
											<Tooltip title='Delete book'>
												<span>
													<IconButton
														size='small'
														onClick={() => handleDelete(book.id)}
														disabled={isBusy}
														color='error'>
														{isDeleting ? <CircularProgress size={18} /> : <DeleteIcon fontSize='small' />}
													</IconButton>
												</span>
											</Tooltip>
										</Box>
									</TableCell>
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>
		</TableContainer>
	);
}

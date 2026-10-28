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
import { Sync as SyncIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { BookWithRequests, ReadarrInstance, BookRequestResponse } from '../../types';
import { EditableCell } from './EditableCell';
import { StatusChip } from './StatusChip';
import { RequestBadge } from '../RequestBadge';

interface BookTableProps {
	books: BookWithRequests[];
	instances: ReadarrInstance[];
	onUpdateBook: (id: string, updates: { title?: string; author?: string }) => Promise<void>;
	onDeleteBook: (id: string) => Promise<void>;
	onSyncStatus: (id: string) => Promise<void>;
	onAddToInstance: (bookId: string, instanceId: string) => Promise<void>;
	onRetryRequest: (request: BookRequestResponse) => Promise<void>;
	loading?: boolean;
}

export function BookTable({
	books,
	instances,
	onUpdateBook,
	onDeleteBook,
	onSyncStatus,
	onAddToInstance,
	onRetryRequest,
	loading = false,
}: BookTableProps) {
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

	/** Badges for the book's category, plus any other instance it was requested from */
	const instancesFor = (book: BookWithRequests): ReadarrInstance[] => {
		const requested = new Set(book.requests.map((r) => r.instanceId));
		return instances.filter((i) => i.category === book.category || requested.has(i.id));
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
						<TableCell sx={{ fontWeight: 600, width: '220px' }}>Formats</TableCell>
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
							const isSyncing = syncingIds.has(book.id);
							const isDeleting = deletingIds.has(book.id);
							const isBusy = isSyncing || isDeleting;

							return (
								<TableRow
									key={book.id}
									sx={{
										'&:hover': { bgcolor: 'action.hover' },
										opacity: isDeleting ? 0.5 : 1,
									}}>
									<TableCell>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											{book.coverUrl ? (
												<Box
													component='img'
													src={book.coverUrl}
													alt=''
													loading='lazy'
													sx={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }}
												/>
											) : (
												<Box
													sx={{ width: 28, height: 42, borderRadius: 0.5, bgcolor: 'action.hover', flexShrink: 0 }}
												/>
											)}
											<Box sx={{ flex: 1, minWidth: 0 }}>
												<EditableCell
													value={book.title}
													onSave={(title) => handleTitleSave(book.id, title)}
													placeholder='Enter title'
													disabled={isBusy}
												/>
											</Box>
										</Box>
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
										<Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
											{instancesFor(book).map((instance) => (
												<RequestBadge
													key={instance.id}
													instance={instance}
													request={book.requests.find((r) => r.instanceId === instance.id)}
													onRetry={onRetryRequest}
													onAdd={(instanceId) => onAddToInstance(book.id, instanceId)}
												/>
											))}
										</Box>
									</TableCell>
									<TableCell>
										<StatusChip requests={book.requests} />
									</TableCell>
									<TableCell align='right'>
										<Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
											<Tooltip title='Check Readarr now'>
												<span>
													<IconButton
														size='small'
														onClick={() => handleSyncStatus(book.id)}
														disabled={isBusy || book.requests.length === 0}
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

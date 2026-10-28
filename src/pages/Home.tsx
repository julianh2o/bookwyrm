import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
	Typography,
	Box,
	Alert,
	Snackbar,
	Button,
	CircularProgress,
	TablePagination,
	Tabs,
	Tab,
	TextField,
	MenuItem,
	Tooltip,
	Chip,
	InputAdornment,
} from '@mui/material';
import { Sync as SyncIcon, Search as SearchIcon } from '@mui/icons-material';

import { APP_TITLE, PAGE_TITLE_HOME } from '../utils/constants';
import { BookTable, AddBookRow } from '../components/BookTable';
import { instanceShortLabel, timeAgo } from '../components/RequestBadge';
import {
	getBooks,
	createBook,
	updateBook,
	deleteBook,
	syncStatus,
	addToInstance,
	retryRequest,
	getInstances,
	syncLibrary,
	getSyncStatus,
	ApiError,
	type InstanceHealth,
} from '../api';
import type { BookWithRequests, ReadarrInstance, CreateBookInput, BookRequestResponse, ListBooksQuery } from '../types';

type View = 'all' | 'fiction' | 'nonfiction' | 'attention';
type Sort = NonNullable<ListBooksQuery['sort']>;

const IN_FLIGHT = new Set(['pending', 'adding', 'searching', 'downloading', 'importing']);

export const Home = () => {
	const [books, setBooks] = useState<BookWithRequests[]>([]);
	const [instances, setInstances] = useState<ReadarrInstance[]>([]);
	const [health, setHealth] = useState<InstanceHealth[]>([]);
	const [attentionCount, setAttentionCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
		open: false,
		message: '',
		severity: 'success',
	});
	const [checking, setChecking] = useState(false);
	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(100);
	const [totalBooks, setTotalBooks] = useState(0);
	const [view, setView] = useState<View>('all');
	const [sort, setSort] = useState<Sort>('recent');
	const [searchText, setSearchText] = useState('');
	const [search, setSearch] = useState('');
	const firstLoad = useRef(true);

	// Debounce the library filter
	useEffect(() => {
		const t = setTimeout(() => {
			setSearch(searchText.trim());
			setPage(0);
		}, 250);
		return () => clearTimeout(t);
	}, [searchText]);

	const fetchData = useCallback(
		async (quiet = false) => {
			try {
				if (!quiet) setLoading(true);
				const query: ListBooksQuery = {
					limit: rowsPerPage,
					offset: page * rowsPerPage,
					sort,
					search: search || undefined,
				};
				if (view === 'fiction' || view === 'nonfiction') query.category = view;
				if (view === 'attention') query.status = 'error';
				const [booksResponse, instancesData, status, attention] = await Promise.all([
					getBooks(query),
					firstLoad.current ? getInstances() : Promise.resolve(null),
					getSyncStatus().catch(() => null),
					getBooks({ status: 'error', limit: 1 }).catch(() => null),
				]);
				setBooks(booksResponse.books);
				setTotalBooks(booksResponse.total);
				if (instancesData) setInstances(instancesData);
				if (status) setHealth(status.instances);
				if (attention) setAttentionCount(attention.total);
				firstLoad.current = false;
				setError(null);
			} catch (err) {
				if (!quiet) setError(err instanceof ApiError ? err.message : 'Failed to load data');
			} finally {
				if (!quiet) setLoading(false);
			}
		},
		[view, page, rowsPerPage, sort, search],
	);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Keep badges moving: refresh quietly, faster while something is in flight
	const anyInFlight = books.some((b) => b.requests.some((r) => IN_FLIGHT.has(r.status)));
	useEffect(() => {
		const t = setInterval(
			() => {
				if (document.visibilityState === 'visible') fetchData(true);
			},
			anyInFlight ? 5000 : 30000,
		);
		return () => clearInterval(t);
	}, [fetchData, anyInFlight]);

	const showSnackbar = (message: string, severity: 'success' | 'error' | 'info') => {
		setSnackbar({ open: true, message, severity });
	};

	const replaceBook = (updated: BookWithRequests) =>
		setBooks((prev) => prev.map((book) => (book.id === updated.id ? updated : book)));

	const handleAddBook = async (input: CreateBookInput) => {
		try {
			const newBook = await createBook(input);
			if (newBook.existing) {
				showSnackbar(`"${newBook.title}" is already in your library`, 'info');
			} else {
				showSnackbar(`Added "${newBook.title}"; sending it to Readarr`, 'success');
			}
			setView((v) => (v === 'attention' ? 'all' : v));
			setSort('recent');
			setPage(0);
			await fetchData(true);
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Failed to add book', 'error');
			throw err;
		}
	};

	const handleUpdateBook = async (id: string, updates: { title?: string; author?: string }) => {
		try {
			replaceBook(await updateBook(id, updates));
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Failed to update book', 'error');
			throw err;
		}
	};

	const handleDeleteBook = async (id: string) => {
		const book = books.find((b) => b.id === id);
		if (!window.confirm(`Remove "${book?.title ?? 'this book'}" from BookWyrm? (Readarr keeps it.)`)) return;
		try {
			await deleteBook(id);
			setBooks((prev) => prev.filter((b) => b.id !== id));
			setTotalBooks((prev) => prev - 1);
			showSnackbar('Removed from BookWyrm', 'success');
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Failed to delete book', 'error');
			throw err;
		}
	};

	const handleSyncStatus = async (id: string) => {
		try {
			const response = await syncStatus(id);
			replaceBook(response.book);
			showSnackbar('Checked Readarr', 'success');
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Failed to check Readarr', 'error');
		}
	};

	const handleAddToInstance = async (bookId: string, instanceId: string) => {
		try {
			const response = await addToInstance(bookId, instanceId);
			replaceBook(response.book);
			showSnackbar('Requested; sending it to Readarr', 'success');
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Failed to request', 'error');
		}
	};

	const handleRetry = async (request: BookRequestResponse) => {
		try {
			const response = await retryRequest(request.id);
			replaceBook(response.book);
			const what: Record<string, string> = {
				add: 'Adding it to Readarr again',
				search: 'Searching again',
				redownload: 'Dropped that download and searching for another',
				import: 'Importing the downloaded files',
			};
			showSnackbar(what[response.action] ?? 'Retrying', 'success');
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Retry failed', 'error');
			await fetchData(true);
		}
	};

	const handleCheckNow = async () => {
		try {
			setChecking(true);
			const { summary } = await syncLibrary();
			await fetchData(true);
			const parts = [];
			if (summary.totalBooksCreated) parts.push(`${summary.totalBooksCreated} new books`);
			if (summary.totalRequestsChanged) parts.push(`${summary.totalRequestsChanged} status changes`);
			showSnackbar(
				summary.totalErrors
					? `${summary.totalErrors} instance(s) couldn't be reached`
					: parts.length
						? `Checked Readarr: ${parts.join(', ')}`
						: 'Checked Readarr: nothing new',
				summary.totalErrors ? 'error' : 'success',
			);
		} catch (err) {
			showSnackbar(err instanceof ApiError ? err.message : 'Check failed', 'error');
		} finally {
			setChecking(false);
		}
	};

	return (
		<>
			<Helmet>
				<title>
					{PAGE_TITLE_HOME} | {APP_TITLE}
				</title>
			</Helmet>
			<Box>
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						mb: 2,
						gap: 2,
						flexWrap: 'wrap',
					}}>
					<Typography variant='h4' sx={{ fontWeight: 700 }}>
						{APP_TITLE}
					</Typography>
					<Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
						{health.map((h) => {
							const instance = instances.find((i) => i.id === h.instanceId);
							const tip = [
								h.instanceName,
								h.ok ? `Checked ${timeAgo(h.lastPollAt)} (${h.durationMs ?? '?'} ms)` : `Unreachable: ${h.error}`,
								`${h.booksTracked} tracked of ${h.booksInLibrary} in Readarr`,
								h.foreignQueueItems
									? `${h.foreignQueueItems} queue item(s) Readarr can't tie to one of its books (usually another instance's downloads sharing the download client category)`
									: null,
							]
								.filter(Boolean)
								.join(' · ');
							return (
								<Tooltip key={h.instanceId} title={tip} arrow>
									<Chip
										size='small'
										variant='outlined'
										color={!h.ok ? 'error' : h.lastPollAt ? 'success' : 'default'}
										label={instance ? instanceShortLabel(instance) : h.instanceId}
									/>
								</Tooltip>
							);
						})}
						<Button
							variant='outlined'
							startIcon={checking ? <CircularProgress size={18} color='inherit' /> : <SyncIcon />}
							onClick={handleCheckNow}
							disabled={checking}>
							{checking ? 'Checking…' : 'Check now'}
						</Button>
					</Box>
				</Box>

				{error && (
					<Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
						{error}
					</Alert>
				)}

				<AddBookRow instances={instances} onAdd={handleAddBook} disabled={loading && firstLoad.current} />

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
					<Tabs
						value={view}
						onChange={(_e: React.SyntheticEvent, v: View) => {
							setView(v);
							setPage(0);
						}}
						sx={{ flex: 1, minWidth: 300 }}>
						<Tab label='All' value='all' />
						<Tab label='Fiction' value='fiction' />
						<Tab label='Nonfiction' value='nonfiction' />
						<Tab
							value='attention'
							label={
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									Needs attention
									{attentionCount > 0 && <Chip size='small' color='error' label={attentionCount} />}
								</Box>
							}
						/>
					</Tabs>
					<TextField
						size='small'
						placeholder='Filter library'
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						InputProps={{
							startAdornment: (
								<InputAdornment position='start'>
									<SearchIcon fontSize='small' />
								</InputAdornment>
							),
						}}
						sx={{ width: 220 }}
					/>
					<TextField
						select
						size='small'
						value={sort}
						onChange={(e) => setSort(e.target.value as Sort)}
						sx={{ width: 160 }}>
						<MenuItem value='recent'>Recently added</MenuItem>
						<MenuItem value='activity'>Recent activity</MenuItem>
						<MenuItem value='title'>Title</MenuItem>
						<MenuItem value='author'>Author</MenuItem>
					</TextField>
				</Box>

				<BookTable
					books={books}
					instances={instances}
					onUpdateBook={handleUpdateBook}
					onDeleteBook={handleDeleteBook}
					onSyncStatus={handleSyncStatus}
					onAddToInstance={handleAddToInstance}
					onRetryRequest={handleRetry}
					loading={loading}
				/>

				<TablePagination
					component='div'
					count={totalBooks}
					page={page}
					onPageChange={(_e: unknown, p: number) => setPage(p)}
					rowsPerPage={rowsPerPage}
					onRowsPerPageChange={(e: React.ChangeEvent<{ value: unknown }>) => {
						setRowsPerPage(parseInt(e.target.value as string, 10));
						setPage(0);
					}}
					rowsPerPageOptions={[25, 50, 100, 250]}
				/>
			</Box>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
				<Alert
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					severity={snackbar.severity}
					sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</>
	);
};

import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Typography, Box, Alert, Snackbar, Button, CircularProgress } from '@mui/material';
import { Sync as SyncIcon, DeleteSweep as PurgeIcon } from '@mui/icons-material';

import { APP_TITLE, PAGE_TITLE_HOME } from '../utils/constants';
import { BookTable, AddBookRow } from '../components/BookTable';
import {
	getBooks,
	createBook,
	updateBook,
	deleteBook,
	processRequests,
	syncStatus,
	addToInstance,
	getInstances,
	syncLibrary,
	purgeLibrary,
	ApiError,
} from '../api';
import type { BookWithRequests, ReadarrInstance, CreateBookInput, BookCategory } from '../types';

export const Home = () => {
	const [books, setBooks] = useState<BookWithRequests[]>([]);
	const [instances, setInstances] = useState<ReadarrInstance[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
		open: false,
		message: '',
		severity: 'success',
	});
	const [syncing, setSyncing] = useState(false);
	const [purging, setPurging] = useState(false);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			const [booksResponse, instancesData] = await Promise.all([getBooks(), getInstances()]);
			setBooks(booksResponse.books);
			setInstances(instancesData);
			setError(null);
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to load data';
			setError(message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const showSnackbar = (message: string, severity: 'success' | 'error') => {
		setSnackbar({ open: true, message, severity });
	};

	const handleCloseSnackbar = () => {
		setSnackbar((prev) => ({ ...prev, open: false }));
	};

	const handleAddBook = async (input: CreateBookInput, _instanceIds: string[]) => {
		try {
			const newBook = await createBook(input);
			setBooks((prev) => [newBook, ...prev]);
			showSnackbar(`Added "${input.title}"`, 'success');
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to add book';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleUpdateBook = async (
		id: string,
		updates: { title?: string; author?: string; category?: BookCategory },
	) => {
		try {
			const updatedBook = await updateBook(id, updates);
			setBooks((prev) => prev.map((book) => (book.id === id ? updatedBook : book)));
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to update book';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleDeleteBook = async (id: string) => {
		try {
			await deleteBook(id);
			setBooks((prev) => prev.filter((book) => book.id !== id));
			showSnackbar('Book deleted', 'success');
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to delete book';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleProcessRequests = async (id: string) => {
		try {
			const response = await processRequests(id);
			setBooks((prev) => prev.map((book) => (book.id === id ? response.book : book)));

			// Check results
			const results = Object.values(response.results);
			const errors = results.filter((r) => r.status === 'error');
			const notFound = results.filter((r) => r.status === 'not_found');

			if (errors.length > 0) {
				showSnackbar(`Some requests failed: ${errors[0].errorMessage}`, 'error');
			} else if (notFound.length > 0) {
				showSnackbar('Book not found in some instances', 'error');
			} else {
				showSnackbar('Requests sent to Readarr', 'success');
			}
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to process requests';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleSyncStatus = async (id: string) => {
		try {
			const response = await syncStatus(id);
			setBooks((prev) => prev.map((book) => (book.id === id ? response.book : book)));

			const changed = response.results.filter((r) => r.changed);
			const nowAvailable = response.results.filter((r) => r.newStatus === 'available');

			if (nowAvailable.length > 0) {
				showSnackbar('Book is now available!', 'success');
			} else if (changed.length > 0) {
				showSnackbar('Status updated', 'success');
			} else {
				showSnackbar('No status changes', 'success');
			}
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to sync status';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleAddToInstance = async (bookId: string, instanceId: string) => {
		try {
			const response = await addToInstance(bookId, instanceId);
			setBooks((prev) => prev.map((book) => (book.id === bookId ? response.book : book)));

			if (response.result.status === 'searching') {
				showSnackbar('Book added and searching', 'success');
			} else if (response.result.status === 'not_found') {
				showSnackbar('Book not found in Readarr', 'error');
			} else if (response.result.status === 'error') {
				showSnackbar(response.result.errorMessage || 'Failed to add book', 'error');
			}
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to add to instance';
			showSnackbar(message, 'error');
			throw err;
		}
	};

	const handleSyncLibrary = async () => {
		try {
			setSyncing(true);
			const response = await syncLibrary();
			const { summary } = response;

			// Refresh books after sync
			await fetchData();

			if (summary.totalErrors > 0) {
				showSnackbar(
					`Synced ${summary.totalBooksImported} books (${summary.totalBooksCreated} new) with ${summary.totalErrors} errors`,
					'error',
				);
			} else {
				showSnackbar(
					`Synced ${summary.totalBooksImported} books (${summary.totalBooksCreated} new, ${summary.totalBooksUpdated} updated)`,
					'success',
				);
			}
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to sync library';
			showSnackbar(message, 'error');
		} finally {
			setSyncing(false);
		}
	};

	const handlePurgeLibrary = async () => {
		if (!window.confirm('Are you sure you want to delete all books? This cannot be undone.')) {
			return;
		}

		try {
			setPurging(true);
			const response = await purgeLibrary();

			// Refresh books after purge
			await fetchData();

			showSnackbar(`Deleted ${response.deletedBooks} books`, 'success');
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'Failed to purge library';
			showSnackbar(message, 'error');
		} finally {
			setPurging(false);
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
						mb: 3,
					}}>
					<Typography variant='h4' sx={{ fontWeight: 700 }}>
						{APP_TITLE}
					</Typography>
					<Box sx={{ display: 'flex', gap: 1 }}>
						<Button
							variant='outlined'
							color='error'
							startIcon={purging ? <CircularProgress size={18} color='inherit' /> : <PurgeIcon />}
							onClick={handlePurgeLibrary}
							disabled={purging || syncing || loading}>
							{purging ? 'Purging...' : 'Purge'}
						</Button>
						<Button
							variant='outlined'
							startIcon={syncing ? <CircularProgress size={18} color='inherit' /> : <SyncIcon />}
							onClick={handleSyncLibrary}
							disabled={syncing || purging || loading}>
							{syncing ? 'Syncing...' : 'Sync Library'}
						</Button>
					</Box>
				</Box>

				{error && (
					<Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
						{error}
					</Alert>
				)}

				<AddBookRow instances={instances} onAdd={handleAddBook} disabled={loading} />

				<BookTable
					books={books}
					instances={instances}
					onUpdateBook={handleUpdateBook}
					onDeleteBook={handleDeleteBook}
					onProcessRequests={handleProcessRequests}
					onSyncStatus={handleSyncStatus}
					onAddToInstance={handleAddToInstance}
					loading={loading}
				/>
			</Box>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={handleCloseSnackbar}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
				<Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</>
	);
};

import { useState, useRef, useEffect, type ElementRef } from 'react';
import {
	Box,
	Button,
	Paper,
	CircularProgress,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
	Tooltip,
} from '@mui/material';
import { Add as AddIcon, Headphones as AudioIcon, MenuBook as EbookIcon } from '@mui/icons-material';
import type { BookCategory, ReadarrInstance, ReadarrType, CreateBookInput } from '../../types';
import { BookAutocomplete, type BookSelection } from '../BookAutocomplete';
import { getBookMetadata } from '../../api';

interface AddBookRowProps {
	instances: ReadarrInstance[];
	onAdd: (book: CreateBookInput) => Promise<void>;
	disabled?: boolean;
}

/**
 * Quick add: type, pick a result (Enter), then Enter again to add.
 * Fiction/nonfiction is guessed from the book's genres; audio + ebook are on by default.
 */
export function AddBookRow({ instances, onAdd, disabled = false }: AddBookRowProps) {
	const [selectedBook, setSelectedBook] = useState<BookSelection | null>(null);
	const [category, setCategory] = useState<BookCategory>('nonfiction');
	const [categoryHint, setCategoryHint] = useState<string | null>(null);
	const [guessing, setGuessing] = useState(false);
	const [formats, setFormats] = useState<ReadarrType[]>(['audio', 'ebook']);
	const [isAdding, setIsAdding] = useState(false);
	const searchRef = useRef<ElementRef<'input'>>(null);
	const addRef = useRef<ElementRef<'button'>>(null);

	// Guess the category as soon as a book is picked, then hand focus to Add so Enter adds it
	useEffect(() => {
		setCategoryHint(null);
		if (!selectedBook) return;
		addRef.current?.focus();
		if (!selectedBook.metadataId || selectedBook.metadataProvider !== 'rreading-glasses') return;
		let cancelled = false;
		setGuessing(true);
		getBookMetadata(selectedBook.metadataId)
			.then((meta) => {
				if (cancelled || !meta.suggestedCategory) return;
				setCategory(meta.suggestedCategory.category);
				setCategoryHint(`Guessed from ${meta.suggestedCategory.reason}`);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setGuessing(false);
				addRef.current?.focus();
			});
		return () => {
			cancelled = true;
		};
	}, [selectedBook]);

	const instanceIds = instances
		.filter((i) => i.enabled && i.category === category && formats.includes(i.type))
		.map((i) => i.id);

	const handleAdd = async () => {
		if (!selectedBook || !selectedBook.title.trim() || instanceIds.length === 0) return;
		setIsAdding(true);
		try {
			await onAdd({
				title: selectedBook.title.trim(),
				author: selectedBook.author.trim() || 'Unknown Author',
				category,
				metadataId: selectedBook.metadataId || null,
				metadataProvider: selectedBook.metadataProvider || null,
				coverUrl: selectedBook.coverUrl || null,
				instanceIds,
			});
			setSelectedBook(null);
			setTimeout(() => searchRef.current?.focus(), 0);
		} catch {
			// Home shows the error; keep the selection so it can be retried
		} finally {
			setIsAdding(false);
		}
	};

	const isValid = !!selectedBook && !!selectedBook.title.trim() && instanceIds.length > 0;

	return (
		<Paper sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}>
			<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
				<BookAutocomplete
					value={selectedBook}
					onChange={setSelectedBook}
					disabled={disabled || isAdding}
					placeholder='Add a book: type a title or author…'
					inputRef={searchRef}
				/>

				<ToggleButtonGroup
					size='small'
					exclusive
					value={category}
					onChange={(_e, v: BookCategory | null) => v && setCategory(v)}
					aria-label='Category'>
					<ToggleButton value='fiction'>Fiction</ToggleButton>
					<ToggleButton value='nonfiction'>Nonfiction</ToggleButton>
				</ToggleButtonGroup>

				<ToggleButtonGroup
					size='small'
					value={formats}
					onChange={(_e, v: ReadarrType[]) => setFormats(v)}
					aria-label='Formats'>
					<Tooltip title='Audiobook'>
						<ToggleButton value='audio' aria-label='Audiobook'>
							<AudioIcon fontSize='small' />
						</ToggleButton>
					</Tooltip>
					<Tooltip title='Ebook'>
						<ToggleButton value='ebook' aria-label='Ebook'>
							<EbookIcon fontSize='small' />
						</ToggleButton>
					</Tooltip>
				</ToggleButtonGroup>

				<Button
					ref={addRef}
					variant='contained'
					startIcon={isAdding ? <CircularProgress size={18} color='inherit' /> : <AddIcon />}
					onClick={handleAdd}
					disabled={disabled || isAdding || !isValid}
					sx={{ minWidth: 100 }}>
					Add
				</Button>
			</Box>
			{(guessing || categoryHint) && (
				<Typography variant='caption' sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
					{guessing ? 'Checking genres…' : categoryHint}
				</Typography>
			)}
		</Paper>
	);
}

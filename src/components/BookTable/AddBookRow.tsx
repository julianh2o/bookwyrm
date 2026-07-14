import React, { useState, useEffect } from 'react';
import { Box, Button, ToggleButton, ToggleButtonGroup, Paper, CircularProgress } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import type { BookCategory, ReadarrInstance, CreateBookInput } from '../../types';
import { InstanceCheckboxes } from '../InstanceCheckboxes';
import { BookAutocomplete, type BookSelection } from '../BookAutocomplete';

interface AddBookRowProps {
	instances: ReadarrInstance[];
	onAdd: (book: CreateBookInput, instanceIds: string[]) => Promise<void>;
	disabled?: boolean;
}

export function AddBookRow({ instances, onAdd, disabled = false }: AddBookRowProps) {
	const [selectedBook, setSelectedBook] = useState<BookSelection | null>(null);
	const [category, setCategory] = useState<BookCategory>('fiction');
	const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
	const [isAdding, setIsAdding] = useState(false);

	// Auto-select instances based on category
	useEffect(() => {
		const defaultInstances = instances.filter((i) => i.category === category && i.enabled).map((i) => i.id);
		setSelectedInstances(defaultInstances);
	}, [category, instances]);

	const handleCategoryChange = (_: React.MouseEvent<HTMLElement>, newCategory: BookCategory | null) => {
		if (newCategory) {
			setCategory(newCategory);
		}
	};

	const handleAdd = async () => {
		if (!selectedBook || !selectedBook.title.trim()) return;

		setIsAdding(true);
		try {
			await onAdd(
				{
					title: selectedBook.title.trim(),
					author: selectedBook.author.trim() || 'Unknown Author',
					category,
					metadataId: selectedBook.metadataId || null,
					metadataProvider: selectedBook.metadataProvider || null,
					coverUrl: selectedBook.coverUrl || null,
				},
				selectedInstances,
			);
			// Clear selection on success
			setSelectedBook(null);
		} finally {
			setIsAdding(false);
		}
	};

	const filteredInstances = instances.filter((i) => i.category === category);
	const isValid = selectedBook && selectedBook.title.trim();

	return (
		<Paper sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}>
			<Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
				<BookAutocomplete
					value={selectedBook}
					onChange={setSelectedBook}
					disabled={disabled || isAdding}
					placeholder='Search for a book...'
				/>

				<ToggleButtonGroup
					value={category}
					exclusive
					onChange={handleCategoryChange}
					size='small'
					disabled={disabled || isAdding}>
					<ToggleButton value='fiction' sx={{ px: 2 }}>
						Fiction
					</ToggleButton>
					<ToggleButton value='nonfiction' sx={{ px: 2 }}>
						Nonfiction
					</ToggleButton>
				</ToggleButtonGroup>

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
					<InstanceCheckboxes
						instances={filteredInstances}
						selectedIds={selectedInstances}
						onChange={setSelectedInstances}
						disabled={disabled || isAdding}
					/>
				</Box>

				<Button
					variant='contained'
					startIcon={isAdding ? <CircularProgress size={18} color='inherit' /> : <AddIcon />}
					onClick={handleAdd}
					disabled={disabled || isAdding || !isValid}
					sx={{ minWidth: 100 }}>
					Add
				</Button>
			</Box>
		</Paper>
	);
}

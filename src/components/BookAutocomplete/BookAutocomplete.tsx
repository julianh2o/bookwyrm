import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Autocomplete, TextField, Box, Typography, CircularProgress, Paper, Chip } from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';
import { searchBooks, type MetadataSearchResult } from '../../api';

export interface BookSelection {
	title: string;
	author: string;
	year?: number;
	metadataId: string;
	metadataProvider: string;
	coverUrl?: string;
}

interface BookAutocompleteProps {
	value: BookSelection | null;
	onChange: (book: BookSelection | null) => void;
	disabled?: boolean;
	placeholder?: string;
	/** Lets the parent put focus back in the search box after adding */
	inputRef?: React.Ref<React.ElementRef<'input'>>;
}

// Custom option type that includes a manual entry option
type AutocompleteOption = MetadataSearchResult | { id: '__manual__'; title: string; isManual: true };

function isManualOption(option: AutocompleteOption): option is { id: '__manual__'; title: string; isManual: true } {
	return 'isManual' in option && option.isManual === true;
}

export function BookAutocomplete({
	value,
	onChange,
	disabled = false,
	placeholder = 'Search for a book...',
	inputRef,
}: BookAutocompleteProps) {
	const [inputValue, setInputValue] = useState('');
	const [options, setOptions] = useState<AutocompleteOption[]>([]);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear input value when a book is selected (we display a chip instead)
	useEffect(() => {
		if (value) {
			setInputValue('');
		}
	}, [value]);

	// Debounced search
	const performSearch = useCallback(async (query: string) => {
		if (query.length < 2) {
			setOptions([]);
			return;
		}

		setLoading(true);
		try {
			const results = await searchBooks(query, 8);

			// Add manual entry option at the end
			const opts: AutocompleteOption[] = [...results, { id: '__manual__', title: query, isManual: true }];
			setOptions(opts);
		} catch (error) {
			console.error('Search error:', error);
			// On error, just show manual entry option
			setOptions([{ id: '__manual__', title: query, isManual: true }]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		// Don't search if we have a selected value
		if (value) {
			setOptions([]);
			return;
		}

		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		if (inputValue.length >= 2) {
			debounceRef.current = setTimeout(() => {
				performSearch(inputValue);
			}, 300);
		} else {
			setOptions([]);
		}

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [inputValue, performSearch, value]);

	const handleSelect = (_event: React.SyntheticEvent, selectedValue: string | AutocompleteOption | null) => {
		if (!selectedValue) {
			onChange(null);
			return;
		}

		// Handle string input (freeSolo)
		if (typeof selectedValue === 'string') {
			onChange({
				title: selectedValue,
				author: '',
				metadataId: '',
				metadataProvider: '',
			});
		} else if (isManualOption(selectedValue)) {
			// Manual entry - just use the title, no author
			onChange({
				title: selectedValue.title,
				author: '',
				metadataId: '',
				metadataProvider: '',
			});
		} else {
			// Selected from search results
			onChange({
				title: selectedValue.title,
				author: selectedValue.authors.join(', '),
				year: selectedValue.year,
				metadataId: selectedValue.id,
				metadataProvider: selectedValue.provider,
				coverUrl: selectedValue.coverUrl,
			});
		}

		setOptions([]);
	};

	const handleClear = () => {
		onChange(null);
		setInputValue('');
		setOptions([]);
	};

	const handleInputChange = (_event: React.SyntheticEvent, newValue: string) => {
		// Don't allow changes when a value is selected (chip is displayed)
		if (value) {
			return;
		}
		setInputValue(newValue);
	};

	return (
		<Autocomplete
			freeSolo
			open={open && options.length > 0 && !value}
			onOpen={() => setOpen(true)}
			onClose={() => setOpen(false)}
			options={options}
			loading={loading}
			inputValue={inputValue}
			onInputChange={handleInputChange}
			onChange={handleSelect}
			disabled={disabled}
			filterOptions={(x) => x} // Don't filter, we control options via search
			getOptionLabel={(option) => {
				if (typeof option === 'string') return option;
				return option.title;
			}}
			getOptionKey={(option) => {
				if (typeof option === 'string') return option;
				return option.id;
			}}
			isOptionEqualToValue={(option, val) => {
				if (typeof option === 'string' || typeof val === 'string') return false;
				return option.id === val.id;
			}}
			PaperComponent={(props) => <Paper {...props} elevation={8} />}
			renderOption={(props, option) => {
				const { key, ...otherProps } = props;

				if (isManualOption(option)) {
					return (
						<Box
							component='li'
							key={key}
							{...otherProps}
							sx={{
								borderTop: '1px solid',
								borderColor: 'divider',
								fontStyle: 'italic',
							}}>
							<Typography variant='body2' color='text.secondary'>
								Add &ldquo;{option.title}&rdquo; manually...
							</Typography>
						</Box>
					);
				}

				return (
					<Box
						component='li'
						key={key}
						{...otherProps}
						sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 1 }}>
						{option.coverUrl && (
							<Box
								component='img'
								src={option.coverUrl}
								alt=''
								sx={{
									width: 36,
									height: 54,
									objectFit: 'cover',
									borderRadius: 0.5,
									flexShrink: 0,
								}}
								onError={(e) => {
									const target = e.target as unknown as { style: { display: string } };
									target.style.display = 'none';
								}}
							/>
						)}
						<Box sx={{ minWidth: 0, flex: 1 }}>
							<Typography variant='body2' sx={{ fontWeight: 600, lineHeight: 1.3 }}>
								{option.title}
							</Typography>
							<Typography variant='body2' sx={{ color: 'text.secondary', mt: 0.25 }}>
								{option.authors.join(', ')}
								{option.year && ` (${option.year})`}
							</Typography>
						</Box>
					</Box>
				);
			}}
			renderInput={(params) => {
				// Build the chip label with title, author, and year
				const chipLabel = value
					? `${value.title}${value.author ? ` - ${value.author}` : ''}${value.year ? ` (${value.year})` : ''}`
					: '';

				return (
					<TextField
						{...params}
						inputRef={inputRef}
						placeholder={value ? '' : placeholder}
						size='small'
						InputProps={{
							...params.InputProps,
							readOnly: !!value,
							startAdornment: value ? (
								<Chip
									label={chipLabel}
									onDelete={disabled ? undefined : handleClear}
									deleteIcon={<ClearIcon />}
									size='small'
									sx={{
										maxWidth: '100%',
										'& .MuiChip-label': {
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										},
									}}
								/>
							) : undefined,
							endAdornment: loading ? <CircularProgress color='inherit' size={18} /> : null,
						}}
						sx={{
							'& .MuiInputBase-input': {
								// Hide the input text when a chip is displayed
								...(value && {
									width: 0,
									minWidth: 0,
									padding: 0,
								}),
							},
						}}
					/>
				);
			}}
			sx={{ flex: '1 1 300px', minWidth: 250 }}
		/>
	);
}

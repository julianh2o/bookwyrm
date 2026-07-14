import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Typography, ClickAwayListener } from '@mui/material';

interface EditableCellProps {
	value: string;
	onSave: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export function EditableCell({ value, onSave, placeholder = '', disabled = false }: EditableCellProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);

	useEffect(() => {
		setEditValue(value);
	}, [value]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleClick = () => {
		if (!disabled) {
			setIsEditing(true);
		}
	};

	const handleSave = () => {
		setIsEditing(false);
		if (editValue.trim() !== value) {
			onSave(editValue.trim());
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			setEditValue(value);
			setIsEditing(false);
		}
	};

	if (isEditing) {
		return (
			<ClickAwayListener onClickAway={handleSave}>
				<TextField
					inputRef={inputRef}
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onKeyDown={handleKeyDown}
					size='small'
					variant='standard'
					fullWidth
					placeholder={placeholder}
					sx={{
						'& .MuiInput-input': {
							py: 0.5,
							fontSize: '0.875rem',
						},
					}}
				/>
			</ClickAwayListener>
		);
	}

	return (
		<Box
			onClick={handleClick}
			sx={{
				cursor: disabled ? 'default' : 'pointer',
				py: 0.5,
				px: 0.5,
				borderRadius: 0.5,
				minHeight: '1.5rem',
				'&:hover': disabled
					? {}
					: {
							bgcolor: 'action.hover',
						},
			}}>
			<Typography
				variant='body2'
				sx={{
					color: value ? 'text.primary' : 'text.secondary',
				}}>
				{value || placeholder}
			</Typography>
		</Box>
	);
}

import { Chip } from '@mui/material';
import type { BookCategory } from '../../types';

interface CategoryChipProps {
	category: BookCategory;
	onClick?: () => void;
	disabled?: boolean;
}

export function CategoryChip({ category, onClick, disabled = false }: CategoryChipProps) {
	return (
		<Chip
			label={category === 'fiction' ? 'Fiction' : 'Nonfiction'}
			color={category === 'fiction' ? 'primary' : 'secondary'}
			size='small'
			onClick={disabled ? undefined : onClick}
			sx={{
				cursor: disabled ? 'default' : 'pointer',
				minWidth: 80,
			}}
		/>
	);
}

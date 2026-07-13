import { ReactNode } from 'react';
import { Box, Container } from '@mui/material';

interface LayoutProps {
	children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
			<Container component='main' sx={{ flex: 1, py: 4 }}>
				{children}
			</Container>
		</Box>
	);
};

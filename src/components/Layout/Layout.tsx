import { ReactNode } from 'react';
import { Box, Container } from '@mui/material';
import { MouseholeBanner } from '../MouseholeBanner';

interface LayoutProps {
	children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
			<MouseholeBanner />
			<Container component='main' sx={{ flex: 1, py: 4 }}>
				{children}
			</Container>
		</Box>
	);
};

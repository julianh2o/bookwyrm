import { Helmet } from 'react-helmet-async';
import { Typography, Box, Paper } from '@mui/material';

import { APP_TITLE, PAGE_TITLE_HOME } from '../utils/constants';

export const Home = () => {
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
						justifyContent: 'center',
						alignItems: 'center',
						mb: 3,
						p: 3,
						borderRadius: 3,
						background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
					}}>
					<Typography variant='h4' sx={{ fontWeight: 700 }}>
						Welcome to {APP_TITLE}
					</Typography>
				</Box>
				<Paper sx={{ p: 4, textAlign: 'center' }}>
					<Typography variant='body1' color='text.secondary'>
						This is a minimal application template. Start building your app here!
					</Typography>
				</Paper>
			</Box>
		</>
	);
};

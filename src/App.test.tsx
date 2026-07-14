import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

describe('App', () => {
	it('renders the home page', () => {
		render(
			<HelmetProvider>
				<App />
			</HelmetProvider>,
		);

		// App renders the title
		expect(screen.getByText(/BookWyrm/i)).toBeInTheDocument();
	});
});

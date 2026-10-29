import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { getMouseholeStatus, type MouseholeStatus } from '../../api';

const POLL_MS = 60_000;

/**
 * Banner shown when Mousehole's MAM cookie is missing or rejected. That's the usual reason MAM downloads sit
 * "stalled with no connections", so it sits above everything else.
 */
export const MouseholeBanner = () => {
	const [status, setStatus] = useState<MouseholeStatus | null>(null);
	const [checking, setChecking] = useState(false);

	// BookWyrm's own API being down is reported elsewhere; on failure keep the last known state
	const load = useCallback(
		(refresh = false) =>
			getMouseholeStatus(refresh).then(
				(s) => setStatus(s),
				() => undefined,
			),
		[],
	);

	useEffect(() => {
		load();
		const t = setInterval(() => {
			if (document.visibilityState === 'visible') load();
		}, POLL_MS);
		return () => clearInterval(t);
	}, [load]);

	if (!status || !status.configured || status.ok) return null;

	const recheck = async () => {
		setChecking(true);
		await load(true);
		setChecking(false);
	};

	return (
		<Alert
			severity='error'
			variant='filled'
			sx={{ borderRadius: 0, '& .MuiAlert-action': { alignItems: 'center', pt: 0 } }}
			action={
				<>
					{status.url && (
						<Button color='inherit' size='small' href={status.url} target='_blank' rel='noopener noreferrer'>
							Open Mousehole
						</Button>
					)}
					<Button color='inherit' size='small' onClick={recheck} disabled={checking}>
						{checking ? 'Checking…' : 'Recheck'}
					</Button>
				</>
			}>
			<AlertTitle>Mousehole cookie problem</AlertTitle>
			{status.message}
		</Alert>
	);
};

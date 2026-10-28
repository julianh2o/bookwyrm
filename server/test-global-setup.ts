import { execSync } from 'child_process';
import path from 'path';

/** Create/migrate the throwaway test database once per run */
export default function setup() {
	execSync('npx prisma migrate deploy', {
		cwd: path.join(__dirname, '..'),
		env: { ...process.env, DATABASE_URL: 'file:./data/test.db' },
		stdio: 'ignore',
	});
}

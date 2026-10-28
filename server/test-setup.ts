// Server test setup.
// Tests must never touch the real database or real Readarr instances: point both at throwaway fixtures
// BEFORE anything imports ./db or loads the Readarr config.
import path from 'path';
import { config } from 'dotenv';

process.env.DATABASE_URL = 'file:./data/test.db';
process.env.READARR_CONFIG_PATH = path.join(__dirname, 'test-fixtures', 'readarr.json');
process.env.DISABLE_POLLER = 'true';

config();

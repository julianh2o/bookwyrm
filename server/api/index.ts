import { Router } from 'express';
import booksRouter from './books';
import settingsRouter from './settings';
import metadataRouter from './metadata';
import syncRouter from './sync';

const router = Router();

router.use('/books', booksRouter);
router.use('/settings', settingsRouter);
router.use('/metadata', metadataRouter);
router.use('/sync', syncRouter);

export default router;

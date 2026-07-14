import { Router } from 'express';
import readarrRouter from './readarr';

const router = Router();

router.use('/readarr', readarrRouter);

export default router;

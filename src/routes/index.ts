import { Router } from 'express';

import userRoutes from './user.routes';
import coinRoutes from './coin.routes';

const router = Router();

router.use('/user', userRoutes);
router.use('/coin', coinRoutes);

export default router;

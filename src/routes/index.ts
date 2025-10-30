import { Router } from 'express';

import userRoutes from './user.routes';
import coinRoutes from './coin.routes';
import authorizer from '@/middlewares/authorizer';
import transactionRoutes from './transaction.routes';

const router = Router();

router.use('/user', userRoutes);
router.use('/coin', coinRoutes);
router.use('/transaction', authorizer, transactionRoutes);

export default router;

import { Router } from 'express';
import { transactionHistory, transactionLeaderboard } from '../controllers/transaction.controller';
const router = Router();

router.get('/history', transactionHistory);
router.get('/leaderboard', transactionLeaderboard);

export default router;

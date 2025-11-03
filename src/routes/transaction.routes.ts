import { Router } from 'express';
import { transactionHistory, transactionLeaderboard ,shareMoney} from '../controllers/transaction.controller';
const router = Router();

router.get('/history', transactionHistory);
router.get('/leaderboard', transactionLeaderboard);
router.post('/share', shareMoney);

export default router;

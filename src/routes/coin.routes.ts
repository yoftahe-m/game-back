import { Router } from 'express';
import { depositCoin, withdrawCoin } from '../controllers/coin.controller';
const router = Router();

router.post('/deposit', depositCoin);
router.post('/withdraw', withdrawCoin);

export default router;
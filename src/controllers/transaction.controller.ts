import { Request, Response } from 'express';
import { fetchHistory, fetchLeaderboard, sendMoney } from '../services/transaction.service';

export const transactionHistory = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { page, size } = req.query;

  try {
    const response = await fetchHistory(Number(page), Number(size), userId);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ message: 'Failed to fetch history.' });
  }
};

export const transactionLeaderboard = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { page, size } = req.query;

  try {
    const response = await fetchLeaderboard(Number(page), Number(size), userId);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ message: 'Failed to fetch leaderboard.' });
  }
};

export const shareMoney = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { amount, personId } = req.body;

  try {
    const response = await sendMoney(Number(amount), userId, personId);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ message: 'Failed to share money.' });
  }
};

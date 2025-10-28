import supabase from '../config/supabase';
import { error } from 'console';
import { NextFunction, Request, Response } from 'express';

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    (req as any).user = { ...data.user, authHeader };
    next();
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

import { transactionHistory } from '@/controllers/transaction.controller';
import supabase from '../config/supabase';

export const fetchHistory = async (page: number, size: number, userId: string) => {
  const pageSize = size || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('*', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .order('created_at')
    .range(from, to);

  if (error) throw error;

  const totalPages = Math.ceil(count! / pageSize);

  return { transactions: data, total: count, totalPages };
};

export const fetchLeaderboard = async (page: number, size: number, userId: string) => {
  const pageSize = size || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('leaderboard')
    .select('*', {
      count: 'exact',
    })
    .order('amount', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const totalPages = Math.ceil(count! / pageSize);

  return { leaders: data, total: count, totalPages };
};

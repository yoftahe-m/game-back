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
    .order('created_at', { ascending: false })
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

export const sendMoney = async (amount: number, user_id: number, person_id: string) => {
  // get sender
  const { data: sender, error: senderError } = await supabase
    .from('users')
    .select('coins')
    .eq('user_id', user_id)
    .single();

  if (senderError || !sender) throw new Error("User not found");
  if (sender.coins < amount) throw new Error("You don't have enough coins");

  // get receiver
  const { data: receiver, error: receiverError } = await supabase
    .from('users')
    .select('coins')
    .eq('user_id', person_id)
    .single();

  if (receiverError || !receiver) throw new Error("Receiver not found");

  // update both balances atomically
  const { error: updateError } = await supabase.rpc('transfer_coins', {
    sender_id: user_id,
    receiver_id: person_id,
    amount,
  });

  if (updateError) throw new Error("Transfer failed");
};

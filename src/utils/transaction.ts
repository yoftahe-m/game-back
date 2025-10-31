import supabase from '@/config/supabase';

export async function addTransaction(amount: number, game: string, winner: string, losers: string[]) {
  const { data, error } = await supabase.rpc('add_transactions', {
    game,
    amount,
    loser_ids: losers,
    winner_id: winner,
  });

  if (error) {
    console.log('error', error);
    return { data: { amount, game, winner, losers }, message: 'failed to transfer' };
  }

  return { data, message: 'transaction successful' };
}

export async function checkBalance(userId: string, amount: number) {
  const { data, error } = await supabase.from('users').select('coins').eq('id', userId).single();

  if (error) {
    console.log(error);
    return 'failed to check coins';
  }

  if (!data) return 'user not found';

  return data.coins >= amount ? 'has enough' : "doesn't have enough coins";
}

import supabase from '@/config/supabase';

export async function addTransaction(amount: number, game: string, winner: string, losers: string[]) {
  try {
    const { data, error } = await supabase.rpc('add_transactions', {
      game,
      amount,
      loser_ids: losers,
      winner_id: winner,
    });
  } catch (error) {
    console.log('error', error);
  }
}

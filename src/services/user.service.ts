import { v4 as uuidv4 } from 'uuid';

import supabase, { supabaseAdmin } from '../config/supabase';

const uploadImage = async (file: Express.Multer.File, userId: string, bucket: string) => {
  await supabase.storage.from(bucket).remove([userId]);

  const fileId = uuidv4();
  const path = `${userId}/${fileId}`;

  const { data, error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    cacheControl: '0',
    contentType: file.mimetype,
    upsert: true,
  });

  if (error) throw new Error(`File upload failed: ${error.message}`);

  const publicURL = supabase.storage.from(bucket).getPublicUrl(path);

  return publicURL.data.publicUrl;
};

// Register User
export const register = async (email: string, password: string, full_name: string, phone: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone },
    },
  });

  if (error) throw error;

  return {
    user: {
      id: data.user!.id,
      email: data.user!.email,
      fullName: data.user!.user_metadata.full_name,
      phone: data.user!.user_metadata.phone,
      profilePic: null,
      created_at: data.user!.created_at,
      coins: 0,
      rewards: 0,
    },
    accessToken: data.session?.access_token,
    refreshToken: data.session?.refresh_token,
  };
};

// Login User
export const login = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  const { data: user, error: userError } = await supabase.from('users').select('*').eq('email', email).single();

  if (userError) throw userError;

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      profilePic: user.picture || null,
      created_at: user.created_at,
      coins: user.coins,
      rewards: user.rewards,
    },
    accessToken: data.session?.access_token,
    refreshToken: data.session?.refresh_token,
  };
};

// Logout User
export const logout = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;

  return true;
};

// Fetch New Token
export const fetchToken = async (refreshToken: string) => {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error) throw error;

  const { data: user, error: userError } = await supabase.from('users').select('coins').eq('id', data?.user?.id).single();

  if (userError) throw userError;
  return {
    accessToken: data.session?.access_token,
    refreshToken: data.session?.refresh_token,
    coins: user?.coins,
  };
};

// update username
export const updateName = async (id: string, full_name: string) => {
  const { data, error } = await supabase.from('users').update({ full_name }).eq('id', id).select().single();

  if (error) throw error;

  return {
    user: {
      id,
      email: data.email,
      fullName: full_name,
      profilePic: data.picture,
      created_at: data.created_at,
    },
  };
};

// update profile pic
export const updateProfilePic = async (id: string, file: Express.Multer.File) => {
  const picture = await uploadImage(file, id, 'profile-pics');

  const { data, error } = await supabase.from('users').update({ picture }).eq('id', id).select().single();

  if (error) throw error;

  return {
    user: {
      id,
      email: data.email,
      fullName: data.full_name,
      profilePic: picture,
      created_at: data.created_at,
    },
  };
};

// update profile
export const updateProfile = async (id: string, full_name: string, phone: string, file?: Express.Multer.File | undefined) => {
  const updateData: { full_name: string; phone: string; picture?: string } = { full_name, phone };
  if (file) {
    const pic = await uploadImage(file, id, 'profile-pics');
    updateData.picture = pic;
  }

  const { data, error } = await supabase.from('users').update(updateData).eq('id', id).select().single();

  if (error) throw error;

  return {
    user: {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone,
      profilePic: data.picture || null,
      created_at: data.created_at,
      coins: data.coins,
      rewards: data.rewards,
    },
  };
};

export const findUser = async (name: string) => {
  const { data, error } = await supabase.from('users').select('full_name,id,picture').ilike('full_name', `${name}%`).range(0, 5);

  if (error) throw new Error('failed to search for a user');
  return data;
};

export const addedUsers = async (page: number, size: number, userId: string) => {
  const pageSize = size || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('referred_wins')
    .select('*', {
      count: 'exact',
    })
    .eq('user_id', userId)
    .range(from, to);

  if (error) throw error;
  const totalPages = Math.ceil(count! / pageSize);

  return { referredUsers: data, total: count, totalPages };
};

export const fetchCoins = async (userId: string) => {
  const { data: user, error: userError } = await supabase.from('users').select('coins').eq('id', userId).single();

  if (userError) throw userError;

  return { ...user };
};

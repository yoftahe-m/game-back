import { Request, Response } from 'express';
import {
  register,
  login,
  logout,
  fetchToken,
  updateName,
  updateProfilePic,
  updateProfile,
  findUser,
  addedUsers,
  fetchCoins,
} from '../services/user.service';

// Register User
export const registerUser = async (req: Request, res: Response) => {
  const { email, password, full_name, phone } = req.body;

  try {
    const response = await register(email, password, full_name, phone);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// Login User
export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const response = await login(email, password);
    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// Logout User
export const logoutUser = async (_req: Request, res: Response) => {
  try {
    await logout();
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// refresh token
export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    const newToken = await fetchToken(refreshToken);
    res.status(200).json(newToken);
  } catch (error: any) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// change name
export const changeName = async (req: any, res: Response) => {
  const { id } = req.user;
  const { fullName } = req.body;

  try {
    const response = await updateName(id, fullName);
    res.status(200).json(response);
  } catch (error: any) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// change profile pic
export const changeProfilePic = async (req: any, res: Response) => {
  const { id } = req.user;

  try {
    const response = await updateProfilePic(id, req.file as Express.Multer.File);
    res.status(200).json(response);
  } catch (error: any) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// change profile
export const changeProfile = async (req: any, res: Response) => {
  const { id } = req.user;
  const { fullName, phone } = req.body;

  try {
    const response = await updateProfile(id, fullName, phone, req.file as Express.Multer.File);
    res.status(200).json(response);
  } catch (error: any) {
    console.log(error);
    res.status(400).json({ message: (error as Error).message });
  }
};

export const searchUser = async (req: any, res: Response) => {
  const { name } = req.query;

  try {
    const response = await findUser(name);
    res.status(200).json(response);
  } catch (error: any) {
    console.log(error);
    res.status(400).json({ message: (error as Error).message });
  }
};

export const referredUser = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { page, size } = req.query;

  try {
    const response = await addedUsers(Number(page), Number(size), userId);
    res.status(200).json(response);
  } catch (error: any) {
    console.log(error);
    res.status(400).json({ message: (error as Error).message });
  }
};
export const refreshCoin = async (req: any, res: Response) => {
  const { id: userId } = req.user;

  try {
    const response = await fetchCoins(userId);
    res.status(200).json(response);
  } catch (error: any) {
    console.log(error);
    res.status(400).json({ message: (error as Error).message });
  }
};

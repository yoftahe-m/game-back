// Register User
import { Request, Response } from "express";

export const depositCoin = async (req: Request, res: Response) => {
  const { email, password, full_name } = req.body;

  try {
    // const user = await register(email, password, full_name);
    res.status(201).json("user");
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};

// Register User
export const withdrawCoin = async (req: Request, res: Response) => {
  const { email, password, full_name } = req.body;

  try {
    // const user = await register(email, password, full_name);
    res.status(201).json("user");
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
};
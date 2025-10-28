import { validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";

export default async (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors)
    const firstError = errors.array()[0];
    res.status(400).json({ message: firstError.msg });
    return;
  }

  next();
};

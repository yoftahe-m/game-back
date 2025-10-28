import { body, query } from "express-validator";

export const validateChangeName = [
  body("fullName")
    .notEmpty()
    .withMessage("Full name is required")
    .isString()
    .withMessage("Full name must be a string")
    .isLength({ min: 2 })
    .withMessage("Full name must be at least 2 characters long"),
];

export const validateRefreshToken = [
  body("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .isString()
    .withMessage("Refresh token must be a string"),
];
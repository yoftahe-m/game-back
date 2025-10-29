import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

import routes from './routes';
import Bootstrap from './bootstrap';
import { errorHandler } from './utils/errorHandler';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: ['*', 'http://localhost:8081'], // Allow only your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed methods
    credentials: true, // Allow credentials (cookies, etc.)
    allowedHeaders: ['Content-Type', 'Authorization'], // Ensure proper headers
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cookieParser());
// app.use(errorHandler);

Bootstrap(app);
app.use('/api', routes);

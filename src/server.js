import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { connectDB } from './config/db.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// 1. Security HTTP Headers
app.use(helmet());

// Global API Rate Limiter (1,000 requests per 15-minute window)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
});
app.use('/api', generalLimiter);

// 2. CORS configuration
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Body & Cookie Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 4. API Routes (Mount all feature routers under /api)
app.use('/api', apiRoutes);

// 5. 404 Route Catch-all for unmapped endpoints
app.use(notFoundHandler);

// 6. Centralized Error Handler Middleware
app.use(errorHandler);

// 7. Start database connection and then listen
const startServer = async () => {
  await connectDB();

  app.listen(config.port, () => {
    console.log(`🚀 InsightBoard Server running on http://localhost:${config.port}`);
    console.log(`📡 Allowed Client Origin: ${config.clientUrl}`);
    console.log(`🩺 Health check: http://localhost:${config.port}/api/health`);
  });
};

startServer();

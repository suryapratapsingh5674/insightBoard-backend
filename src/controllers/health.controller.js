import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * @desc   Check API server and database health status
 * @route  GET /api/health
 * @access Public
 */
export const checkHealth = (req, res) => {
  const dbStateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const dbState = dbStateMap[mongoose.connection.readyState] || 'unknown';

  const healthData = {
    status: 'healthy',
    environment: config.nodeEnv,
    database: dbState,
    timestamp: new Date().toISOString(),
  };

  return sendSuccess(res, 'InsightBoard API server is running healthy', healthData);
};

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';

import healthRoutes from './routes/health.routes.js';
import productRoutes from './routes/products.routes.js';
import cronRoutes from './routes/cron.routes.js';
import {
  StoreTimeoutError,
  StoreHttpError,
  StoreNetworkError,
  StructureChangedError
} from './errors/errors.js';

const app = express();

// Security and utility middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api', healthRoutes);
app.use('/api', productRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/runs', cronRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'INE Price Tracker API',
    phase: 'Phase 2 - Product Search & Tracking API',
    docs: '/api/health'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  // Handle Zod Validation Errors -> 400 Bad Request
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Log non-validation internal errors
  console.error('[API Error]:', err.message || err);

  // Handle Store Timeout -> 504 Gateway Timeout
  if (err instanceof StoreTimeoutError) {
    return res.status(504).json({
      error: 'Store Gateway Timeout',
      message: err.message
    });
  }

  // Handle Store Errors (Network / HTTP / Structure) -> 502 Bad Gateway
  if (
    err instanceof StoreHttpError ||
    err instanceof StoreNetworkError ||
    err instanceof StructureChangedError
  ) {
    return res.status(502).json({
      error: 'Store Gateway Error',
      message: err.message
    });
  }

  // Fallback -> 500 Internal Server Error (Never leak stack trace to client)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

export default app;

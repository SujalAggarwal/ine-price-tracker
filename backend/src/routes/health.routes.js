import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

router.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('products').select('count', { count: 'exact', head: true });
      if (!error) {
        dbStatus = 'connected';
      } else {
        dbError = error.message;
      }
    } else {
      dbStatus = 'unconfigured';
    }
  } catch (err) {
    dbError = err.message;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ine-price-tracker-backend',
    version: '1.0.0',
    database: {
      status: dbStatus,
      error: dbError
    }
  });
});

export default router;

import app from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Backend Server] Server running on http://localhost:${PORT}`);
  console.log(`[Backend Server] Health check available at http://localhost:${PORT}/api/health`);
});

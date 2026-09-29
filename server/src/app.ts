import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { authRouter } from './routes/auth.js';
import { semestersRouter } from './routes/semesters.js';

// App factory without listen(), so tests can mount it on an ephemeral port.
export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: ['http://localhost:5173'],
      credentials: true
    })
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/semesters', semestersRouter);

  // Never leak raw errors: malformed JSON -> 400, anything else -> generic 500.
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed' || err?.status === 400) {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  };
  app.use(errors);
  return app;
}

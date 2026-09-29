import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server/dist/app.js';

const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  app(req as never, res as never);
}

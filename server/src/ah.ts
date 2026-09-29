import type { NextFunction, Request, Response } from 'express';

// Express 4 does not forward async handler rejections: wrap every async
// route so failures reach the error middleware instead of hanging.
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

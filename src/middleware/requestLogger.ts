import { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  const { method, path } = req;

  const log: Record<string, any> = { timestamp, method, path };

  if (Object.keys(req.query).length > 0) {
    log.query = req.query;
  }

  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    delete safeBody.password;
    log.body = safeBody;
  }

  console.log(JSON.stringify(log));
  next();
}

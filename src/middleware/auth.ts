import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AppError, ErrorCode } from "../errors";

export interface TokenPayload {
  userId: string;
  deviceId: string;
  refreshSessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      token?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, "Missing or invalid authorization header");
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    req.token = payload;
    next();
  } catch {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, "Invalid or expired access token");
  }
}

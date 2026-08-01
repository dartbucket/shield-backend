import { Request, Response, NextFunction } from "express";
import { AppError, ErrorCode } from "../errors";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}

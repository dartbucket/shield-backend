import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { TokenPayload } from "../middleware/auth";
import { RefreshSession, IRefreshSession } from "../models";

export function generateChallenge(): string {
  return crypto.randomBytes(config.challengeLength).toString("base64");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.accessTokenLifetime,
  });
}

export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createRefreshTokenPair(): {
  token: string;
  hash: string;
} {
  const token = generateRefreshTokenValue();
  const hash = hashToken(token);
  return { token, hash };
}

export function generateAccessAndRefreshToken(
  userId: string,
  deviceId: string,
  refreshSessionId: string
): { accessToken: string; refreshToken: string; refreshTokenHash: string } {
  const accessToken = generateAccessToken({ userId, deviceId, refreshSessionId });
  const { token: refreshToken, hash: refreshTokenHash } = createRefreshTokenPair();
  return { accessToken, refreshToken, refreshTokenHash };
}

export async function createRefreshSession(
  userId: string,
  deviceId: string
): Promise<IRefreshSession> {
  // Revoke any existing refresh tokens for this device
  await RefreshSession.updateMany(
    { deviceId, revokedAt: null },
    { revokedAt: new Date() }
  );

  const { token: _unused, hash: refreshTokenHash } = createRefreshTokenPair();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.refreshTokenLifetime * 1000);

  const session = await RefreshSession.create({
    userId,
    deviceId,
    tokenHash: refreshTokenHash,
    expiresAt,
    lastUsedAt: now,
  });

  return session;
}

export async function rotateRefreshSession(
  oldSession: IRefreshSession
): Promise<{ accessToken: string; refreshToken: string; refreshTokenHash: string }> {
  // Revoke the old session
  oldSession.revokedAt = new Date();
  await oldSession.save();

  // Create a new one
  const { token: refreshToken, hash: refreshTokenHash } = createRefreshTokenPair();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.refreshTokenLifetime * 1000);

  const newSession = await RefreshSession.create({
    userId: oldSession.userId,
    deviceId: oldSession.deviceId,
    tokenHash: refreshTokenHash,
    expiresAt,
    lastUsedAt: now,
  });

  const accessToken = generateAccessToken({
    userId: oldSession.userId.toString(),
    deviceId: oldSession.deviceId.toString(),
    refreshSessionId: newSession._id.toString(),
  });

  return { accessToken, refreshToken, refreshTokenHash };
}

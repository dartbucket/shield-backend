import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { AppError, ErrorCode } from "../errors";
import { User, Device, OobLoginSession, OobSessionStatus, RefreshSession } from "../models";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  generateChallenge,
  hashToken,
  hashPassword,
  verifyPassword,
  generateAccessAndRefreshToken,
  createRefreshSession,
  rotateRefreshSession,
} from "../services/auth";
import {
  signupSchema,
  loginSchema,
  oobCreateSessionSchema,
  oobApproveSchema,
  oobRejectSchema,
  refreshSchema,
  logoutSchema,
} from "../validators";
import { Server as SocketIOServer } from "socket.io";

export function createAuthRouter(io: SocketIOServer): Router {
  const router = Router();

  router.post(
    "/auth/signup",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { email, password, deviceName, platform, appVersion } = parsed.data;

      const existing = await User.findOne({ email });
      if (existing) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 409, "Email already registered");
      }

      const passwordHash = await hashPassword(password);
      const user = await User.create({ email, passwordHash });

      const device = await Device.create({
        userId: user._id,
        type: platform === "android" || platform === "ios" ? "mobile" : "desktop",
        platform,
        deviceName,
        appVersion,
      });

      const refreshSession = await createRefreshSession(user._id.toString(), device._id.toString());
      const { accessToken, refreshToken } = generateAccessAndRefreshToken(
        user._id.toString(),
        device._id.toString(),
        refreshSession._id.toString()
      );

      refreshSession.tokenHash = hashToken(refreshToken);
      await refreshSession.save();

      res.status(201).json({
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        device: {
          id: device._id,
          type: device.type,
          platform: device.platform,
          deviceName: device.deviceName,
          appVersion: device.appVersion,
          lastSeen: device.lastSeen,
          createdAt: device.createdAt,
        },
      });
    })
  );

  router.post(
    "/auth/login",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { email, password, deviceName, platform, appVersion } = parsed.data;

      const user = await User.findOne({ email });
      if (!user) {
        throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, "Invalid email or password");
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, "Invalid email or password");
      }

      const deviceType = platform === "android" || platform === "ios" ? "mobile" : "desktop";

      const device = await Device.create({
        userId: user._id,
        type: deviceType,
        platform,
        deviceName,
        appVersion,
      });

      const refreshSession = await createRefreshSession(user._id.toString(), device._id.toString());
      const { accessToken, refreshToken } = generateAccessAndRefreshToken(
        user._id.toString(),
        device._id.toString(),
        refreshSession._id.toString()
      );

      refreshSession.tokenHash = hashToken(refreshToken);
      await refreshSession.save();

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        device: {
          id: device._id,
          type: device.type,
          platform: device.platform,
          deviceName: device.deviceName,
          appVersion: device.appVersion,
          lastSeen: device.lastSeen,
          createdAt: device.createdAt,
        },
      });
    })
  );

  router.post(
    "/auth/oob/create-session",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = oobCreateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { email, password, deviceName, platform, appVersion } = parsed.data;
      const socketId = req.headers["x-socket-id"] as string;

      if (!socketId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, "Missing x-socket-id header");
      }

      const user = await User.findOne({ email });
      if (!user) {
        throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, "Invalid email or password");
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, "Invalid email or password");
      }

      const deviceType = platform === "android" || platform === "ios" ? "mobile" : "desktop";

      const device = await Device.create({
        userId: user._id,
        type: deviceType,
        platform,
        deviceName,
        appVersion,
      });

      const sessionId = uuidv4();
      const challenge = generateChallenge();
      const expiresAt = new Date(Date.now() + config.oobSessionLifetime * 1000);

      await OobLoginSession.create({
        sessionId,
        loginDeviceId: device._id,
        challenge,
        status: OobSessionStatus.PENDING,
        expiresAt,
        ipAddress: req.ip || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        socketId,
      });

      res.status(201).json({
        sessionId,
        deviceId: device._id,
      });
    })
  );

  router.get(
    "/auth/oob/challenge/:sessionId",
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const session = await OobLoginSession.findOne({ sessionId });
      if (!session) {
        throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, "Session not found");
      }

      if (session.status === OobSessionStatus.EXPIRED || new Date() > session.expiresAt) {
        session.status = OobSessionStatus.EXPIRED;
        await session.save();
        throw new AppError(ErrorCode.SESSION_EXPIRED, 410, "Session has expired");
      }

      if (session.status === OobSessionStatus.APPROVED) {
        throw new AppError(ErrorCode.SESSION_ALREADY_APPROVED, 409, "Session already approved");
      }

      if (session.status === OobSessionStatus.DECLINED) {
        throw new AppError(ErrorCode.SESSION_ALREADY_APPROVED, 409, "Session was declined");
      }

      res.json({
        sessionId: session.sessionId,
        challenge: session.challenge,
      });
    })
  );

  router.post(
    "/auth/oob/approve",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = oobApproveSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { sessionId, challenge, signature, deviceId } = parsed.data;

      const session = await OobLoginSession.findOne({ sessionId });
      if (!session) {
        throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, "Session not found");
      }

      if (session.status === OobSessionStatus.EXPIRED || new Date() > session.expiresAt) {
        session.status = OobSessionStatus.EXPIRED;
        await session.save();
        throw new AppError(ErrorCode.SESSION_EXPIRED, 410, "Session has expired");
      }

      if (session.challenge !== challenge) {
        throw new AppError(ErrorCode.CHALLENGE_EXPIRED, 400, "Challenge mismatch or expired");
      }

      const approvingDevice = await Device.findById(deviceId);
      if (!approvingDevice || approvingDevice.revoked) {
        throw new AppError(ErrorCode.DEVICE_REVOKED, 403, "Approving device not found or revoked");
      }

      if (!approvingDevice.publicKey) {
        throw new AppError(ErrorCode.INVALID_SIGNATURE, 400, "Approving device has no public key");
      }

      const crypto = await import("crypto");
      const verifier = crypto.createVerify("SHA256");
      verifier.update(challenge);
      verifier.end();

      let signatureValid = false;
      try {
        const publicKeyPem = Buffer.from(approvingDevice.publicKey, "base64").toString("utf8");
        signatureValid = verifier.verify(publicKeyPem, signature, "base64");
      } catch {
        signatureValid = false;
      }

      if (!signatureValid) {
        throw new AppError(ErrorCode.INVALID_SIGNATURE, 401, "Invalid signature");
      }

      session.status = OobSessionStatus.APPROVED;
      session.approvedAt = new Date();
      session.approvingDeviceId = approvingDevice._id;
      await session.save();

      const loginDevice = await Device.findById(session.loginDeviceId);
      if (!loginDevice) {
        throw new AppError(ErrorCode.DEVICE_NOT_FOUND, 404, "Login device not found");
      }

      const refreshSession = await createRefreshSession(
        loginDevice.userId.toString(),
        session.loginDeviceId.toString()
      );
      const { accessToken, refreshToken } = generateAccessAndRefreshToken(
        loginDevice.userId.toString(),
        session.loginDeviceId.toString(),
        refreshSession._id.toString()
      );

      refreshSession.tokenHash = hashToken(refreshToken);
      await refreshSession.save();

      io.to(session.socketId).emit("oob.approved", {
        event: "oob.approved",
        accessToken,
        refreshToken,
      });

      res.json({ message: "Session approved" });
    })
  );

  router.post(
    "/auth/oob/reject",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = oobRejectSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { sessionId, deviceId } = parsed.data;

      const session = await OobLoginSession.findOne({ sessionId });
      if (!session) {
        throw new AppError(ErrorCode.SESSION_NOT_FOUND, 404, "Session not found");
      }

      const device = await Device.findById(deviceId);
      if (!device || device.revoked) {
        throw new AppError(ErrorCode.DEVICE_REVOKED, 403, "Device not found or revoked");
      }

      session.status = OobSessionStatus.DECLINED;
      session.approvingDeviceId = device._id;
      await session.save();

      io.to(session.socketId).emit("oob.declined", {
        event: "oob.declined",
      });

      res.json({ message: "Session declined" });
    })
  );

  router.post(
    "/auth/refresh",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { refreshToken } = parsed.data;
      const tokenHash = hashToken(refreshToken);

      const session = await RefreshSession.findOne({
        tokenHash,
        revokedAt: null,
      });

      if (!session) {
        throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN, 401, "Invalid refresh token");
      }

      if (new Date() > session.expiresAt) {
        session.revokedAt = new Date();
        await session.save();
        throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN, 401, "Refresh token has expired");
      }

      const device = await Device.findById(session.deviceId);
      if (!device || device.revoked) {
        session.revokedAt = new Date();
        await session.save();
        throw new AppError(ErrorCode.DEVICE_REVOKED, 403, "Device has been revoked");
      }

      const rotated = await rotateRefreshSession(session);

      res.json({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
      });
    })
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = logoutSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const { refreshToken } = parsed.data;
      const tokenHash = hashToken(refreshToken);

      await RefreshSession.updateMany(
        { tokenHash, revokedAt: null },
        { revokedAt: new Date() }
      );

      res.json({ message: "Logged out successfully" });
    })
  );

  return router;
}

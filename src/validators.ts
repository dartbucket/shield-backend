import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceName: z.string().min(1),
  platform: z.enum(["android", "ios", "windows", "macos", "linux"]),
  appVersion: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.enum(["android", "ios", "windows", "macos", "linux"]),
  appVersion: z.string().min(1),
});

export const oobCreateSessionSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.enum(["android", "ios", "windows", "macos", "linux"]),
  appVersion: z.string().min(1),
});

export const oobApproveSchema = z.object({
  sessionId: z.string().uuid(),
  challenge: z.string(),
  signature: z.string(),
  deviceId: z.string(),
});

export const oobRejectSchema = z.object({
  sessionId: z.string().uuid(),
  deviceId: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const logoutSchema = z.object({
  refreshToken: z.string(),
});

export const updateDeviceNameSchema = z.object({
  deviceName: z.string().min(1),
});

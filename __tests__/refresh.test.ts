import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers";
import type { Server } from "http";

let app: Express.Application;
let server: Server;

beforeAll(async () => {
  const test = await setupTestApp();
  app = test.app as any;
  server = test.server;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await teardownTestApp();
});

describe("POST /auth/refresh", () => {
  it("should issue new tokens with a valid refresh token", async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "refresh@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    const oldRefreshToken = signupRes.body.refreshToken;

    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(oldRefreshToken);
  });

  it("should reject reused refresh token (rotation)", async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "rotate@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    const oldRefreshToken = signupRes.body.refreshToken;

    // First refresh succeeds
    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    // Second refresh with same token fails
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("should reject invalid refresh token", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "invalid-token-here" })
      .expect(401);

    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

describe("POST /auth/logout", () => {
  it("should revoke refresh token on logout", async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "logout@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    const refreshToken = signupRes.body.refreshToken;

    await request(app)
      .post("/auth/logout")
      .send({ refreshToken })
      .expect(200);

    // Refresh after logout should fail
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(401);

    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });
});

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

describe("POST /auth/signup", () => {
  it("should create a new user and return tokens", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        email: "test@example.com",
        password: "password123",
        deviceName: "Test Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("test@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.device).toBeDefined();
    expect(res.body.device.platform).toBe("macos");
  });

  it("should reject duplicate email", async () => {
    await request(app)
      .post("/auth/signup")
      .send({
        email: "dup@example.com",
        password: "password123",
        deviceName: "Test",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(201);

    const res = await request(app)
      .post("/auth/signup")
      .send({
        email: "dup@example.com",
        password: "password123",
        deviceName: "Test",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(409);

    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("should reject short password", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        email: "test@example.com",
        password: "short",
        deviceName: "Test",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /auth/login", () => {
  it("should login and return tokens", async () => {
    await request(app)
      .post("/auth/signup")
      .send({
        email: "login@example.com",
        password: "password123",
        deviceName: "Test Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "login@example.com",
        password: "password123",
        deviceName: "Test Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("login@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.device).toBeDefined();
    expect(res.body.device.platform).toBe("macos");
  });

  it("should reject invalid password", async () => {
    await request(app)
      .post("/auth/signup")
      .send({
        email: "badlogin@example.com",
        password: "password123",
        deviceName: "Test",
        platform: "macos",
        appVersion: "1.0.0",
      });

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "badlogin@example.com",
        password: "wrongpassword",
        deviceName: "Test",
        platform: "macos",
        appVersion: "1.0.0",
      })
      .expect(401);

    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });
});

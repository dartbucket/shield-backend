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

describe("Device routes", () => {
  let accessToken: string;
  let deviceId: string;

  beforeEach(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        email: `devices${Date.now()}@example.com`,
        password: "password123",
        deviceName: "My Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    accessToken = res.body.accessToken;
    deviceId = res.body.deviceId;
  });

  describe("GET /devices", () => {
    it("should list devices for authenticated user", async () => {
      const res = await request(app)
        .get("/devices")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.devices).toBeInstanceOf(Array);
      expect(res.body.devices.length).toBeGreaterThanOrEqual(1);
    });

    it("should reject unauthenticated request", async () => {
      const res = await request(app)
        .get("/devices")
        .expect(401);

      expect(res.body.code).toBe("UNAUTHORIZED");
    });
  });

  describe("PATCH /devices/:id/name", () => {
    it("should update device name", async () => {
      const res = await request(app)
        .patch(`/devices/${deviceId}/name`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceName: "Updated Desktop" })
        .expect(200);

      expect(res.body.device.deviceName).toBe("Updated Desktop");
    });

    it("should reject update for non-existent device", async () => {
      const res = await request(app)
        .patch("/devices/507f1f77bcf86cd799439011/name")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceName: "Ghost" })
        .expect(404);

      expect(res.body.code).toBe("DEVICE_NOT_FOUND");
    });
  });

  describe("DELETE /devices/:id", () => {
    it("should revoke a device", async () => {
      const res = await request(app)
        .delete(`/devices/${deviceId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.message).toBe("Device revoked");

      // Verify device is marked as revoked
      const listRes = await request(app)
        .get("/devices")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const revokedDevice = listRes.body.devices.find((d: any) => d._id === deviceId);
      expect(revokedDevice.revoked).toBe(true);
    });

    it("should reject deletion of non-existent device", async () => {
      const res = await request(app)
        .delete("/devices/507f1f77bcf86cd799439011")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.code).toBe("DEVICE_NOT_FOUND");
    });
  });

  describe("JWT authentication middleware", () => {
    it("should reject expired token", async () => {
      const res = await request(app)
        .get("/devices")
        .set("Authorization", "Bearer invalid.jwt.token")
        .expect(401);

      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("should reject missing auth header", async () => {
      const res = await request(app)
        .get("/devices")
        .expect(401);

      expect(res.body.code).toBe("UNAUTHORIZED");
    });
  });
});

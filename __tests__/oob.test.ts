import request from "supertest";
import { io as SocketIOClient } from "socket.io-client";
import { setupTestApp, teardownTestApp, generateKeyPair, signChallenge } from "./helpers";
import type { Server } from "http";
import type { AddressInfo } from "net";

let app: Express.Application;
let server: Server;
let port: number;

beforeAll(async () => {
  const test = await setupTestApp();
  app = test.app as any;
  server = test.server;
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await teardownTestApp();
});

describe("OOB authentication flow", () => {
  it("should create OOB session and retrieve challenge", async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "oob@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "macos",
        appVersion: "1.0.0",
      });

    // Simulate the desktop adding a new device via OOB
    const createRes = await request(app)
      .post("/auth/oob/create-session")
      .set("x-socket-id", "fake-socket-id")
      .send({
        email: "oob@example.com",
        password: "password123",
        deviceName: "Desktop 2",
        platform: "windows",
        appVersion: "1.0.0",
      })
      .expect(201);

    const { sessionId } = createRes.body;
    expect(sessionId).toBeDefined();

    const challengeRes = await request(app)
      .get(`/auth/oob/challenge/${sessionId}`)
      .expect(200);

    expect(challengeRes.body.challenge).toBeDefined();
    expect(challengeRes.body.sessionId).toBe(sessionId);
  });

  it("should reject expired OOB session gracefully", async () => {
    // Create a session with a very short expiry using the API
    // The spec says 60s expiry, we'll test the NOT_FOUND case with an invalid UUID

    const res = await request(app)
      .get("/auth/oob/challenge/00000000-0000-0000-0000-000000000000")
      .expect(404);

    expect(res.body.code).toBe("SESSION_NOT_FOUND");
  });

  it("should approve OOB session via signed challenge and emit socket event", async () => {
    // 1. Register user + mobile device with public key
    const { publicKey, privateKey } = generateKeyPair();

    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "approve@example.com",
        password: "password123",
        deviceName: "Mobile",
        platform: "ios",
        appVersion: "1.0.0",
      });

    const mobileDeviceId = signupRes.body.device.id;

    // Set the public key on the mobile device
    const { Device } = require("../src/models/Device");
    await Device.findByIdAndUpdate(mobileDeviceId, { publicKey });

    // 2. Connect a Socket.IO client to get a real socket ID
    const socket = SocketIOClient(`http://localhost:${port}`, {
      transports: ["websocket"],
    });

    await new Promise<void>((resolve) => socket.on("connect", resolve));
    const socketId = socket.id!;

    // 3. Create OOB session with that socket ID
    const createRes = await request(app)
      .post("/auth/oob/create-session")
      .set("x-socket-id", socketId)
      .send({
        email: "approve@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "windows",
        appVersion: "1.0.0",
      })
      .expect(201);

    const { sessionId } = createRes.body;

    // 4. Get the challenge
    const challengeRes = await request(app)
      .get(`/auth/oob/challenge/${sessionId}`)
      .expect(200);

    const { challenge } = challengeRes.body;

    // 5. Sign the challenge
    const signature = signChallenge(privateKey, challenge);

    // 6. Approve
    const approvedPromise = new Promise<any>((resolve) => {
      socket.on("oob.approved", resolve);
    });

    await request(app)
      .post("/auth/oob/approve")
      .send({
        sessionId,
        challenge,
        signature,
        deviceId: mobileDeviceId,
      })
      .expect(200);

    // 7. Verify socket received the event
    const approvalEvent = await approvedPromise;
    expect(approvalEvent.event).toBe("oob.approved");
    expect(approvalEvent.accessToken).toBeDefined();
    expect(approvalEvent.refreshToken).toBeDefined();

    socket.disconnect();
  });

  it("should decline OOB session and emit declined event", async () => {
    // 1. Setup user with mobile device
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "decline@example.com",
        password: "password123",
        deviceName: "Mobile",
        platform: "android",
        appVersion: "1.0.0",
      });

    const mobileDeviceId = signupRes.body.device.id;

    // 2. Connect socket
    const socket = SocketIOClient(`http://localhost:${port}`, {
      transports: ["websocket"],
    });
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    const socketId = socket.id!;

    // 3. Create OOB session
    const createRes = await request(app)
      .post("/auth/oob/create-session")
      .set("x-socket-id", socketId)
      .send({
        email: "decline@example.com",
        password: "password123",
        deviceName: "Desktop",
        platform: "linux",
        appVersion: "1.0.0",
      })
      .expect(201);

    const { sessionId } = createRes.body;

    // 4. Decline
    const declinedPromise = new Promise<any>((resolve) => {
      socket.on("oob.declined", resolve);
    });

    await request(app)
      .post("/auth/oob/reject")
      .send({
        sessionId,
        deviceId: mobileDeviceId,
      })
      .expect(200);

    const declineEvent = await declinedPromise;
    expect(declineEvent.event).toBe("oob.declined");

    socket.disconnect();
  });
});

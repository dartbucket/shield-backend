import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { errorHandler } from "../src/middleware/errorHandler";
import { createAuthRouter } from "../src/routes/auth";
import { createDeviceRouter } from "../src/routes/devices";

let mongoServer: MongoMemoryServer;

export async function setupTestApp() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  app.set("io", io);
  app.use(express.json());
  app.use(createAuthRouter(io));
  app.use(createDeviceRouter());
  app.use(errorHandler);

  return { app, server, io };
}

export async function teardownTestApp() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
}

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const crypto = require("crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    publicKey: Buffer.from(publicKey).toString("base64"),
    privateKey,
  };
}

export function signChallenge(privateKey: string, challenge: string): string {
  const crypto = require("crypto");
  const sign = crypto.createSign("SHA256");
  sign.update(challenge);
  sign.end();
  return sign.sign(privateKey, "base64");
}

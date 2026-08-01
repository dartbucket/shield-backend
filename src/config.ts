import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/shield",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  accessTokenLifetime: 15 * 60, // 15 minutes
  refreshTokenLifetime: 30 * 24 * 60 * 60, // 30 days
  oobSessionLifetime: 60, // 60 seconds
  challengeLength: 32, // 32 random bytes
};

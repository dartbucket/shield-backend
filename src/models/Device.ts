import mongoose, { Document, Schema } from "mongoose";

export interface IDevice extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: "mobile" | "desktop";
  platform: "android" | "ios" | "windows" | "macos" | "linux";
  deviceName: string;
  publicKey: string | null;
  appVersion: string;
  lastSeen: Date;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["mobile", "desktop"], required: true },
    platform: {
      type: String,
      enum: ["android", "ios", "windows", "macos", "linux"],
      required: true,
    },
    deviceName: { type: String, required: true },
    publicKey: { type: String, default: null },
    appVersion: { type: String, required: true },
    lastSeen: { type: Date, default: Date.now },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Device = mongoose.model<IDevice>("Device", deviceSchema);

import mongoose, { Document, Schema } from "mongoose";

export enum OobSessionStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
}

export interface IOobLoginSession extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  loginDeviceId: mongoose.Types.ObjectId;
  approvingDeviceId: mongoose.Types.ObjectId | null;
  challenge: string;
  status: OobSessionStatus;
  expiresAt: Date;
  approvedAt: Date | null;
  ipAddress: string;
  userAgent: string;
  socketId: string;
  createdAt: Date;
}

const oobLoginSessionSchema = new Schema<IOobLoginSession>(
  {
    sessionId: { type: String, required: true, unique: true },
    loginDeviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    approvingDeviceId: { type: Schema.Types.ObjectId, ref: "Device", default: null },
    challenge: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(OobSessionStatus),
      default: OobSessionStatus.PENDING,
    },
    expiresAt: { type: Date, required: true },
    approvedAt: { type: Date, default: null },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    socketId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL index to auto-delete expired sessions
oobLoginSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OobLoginSession = mongoose.model<IOobLoginSession>(
  "OobLoginSession",
  oobLoginSessionSchema
);

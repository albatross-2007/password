import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIpRateLimit extends Document {
  ip: string;
  requestCount: number;
  windowStart: Date;
  violations: number;
  blocked: boolean;
  blockedUntil: Date | null;
}

const IpRateLimitSchema = new Schema<IIpRateLimit>({
  ip: { type: String, required: true, unique: true, index: true },
  requestCount: { type: Number, default: 0 },
  windowStart: { type: Date, default: () => new Date() },
  violations: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false },
  blockedUntil: { type: Date, default: null },
});

const IpRateLimit: Model<IIpRateLimit> =
  mongoose.models.IpRateLimit ?? mongoose.model<IIpRateLimit>("IpRateLimit", IpRateLimitSchema);

export default IpRateLimit;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAppSecret extends Document {
  key: string;
  value: string;
}

const AppSecretSchema = new Schema<IAppSecret>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

const AppSecret: Model<IAppSecret> =
  mongoose.models.AppSecret ?? mongoose.model<IAppSecret>("AppSecret", AppSecretSchema);

export default AppSecret;

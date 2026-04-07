import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  rollno: string;
  email: string;
  password: string; // bcrypt hash
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    rollno: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{6}$/,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[a-z]+\.\d+@sxcce\.edu\.in$/,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);

export default User;

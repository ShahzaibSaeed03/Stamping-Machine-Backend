import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  creation_date: { type: Date, default: Date.now },
  email: { type: String, required: true, unique: true },
});
const User = mongoose.model("User", userSchema);

export default User;

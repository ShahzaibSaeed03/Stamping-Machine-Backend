import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventId: { type: String, unique: true }
});

export default mongoose.model("WebhookEvent", schema);
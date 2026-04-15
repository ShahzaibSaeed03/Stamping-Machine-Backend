// models/webhookEventModel.js
import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema({
  eventId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  error: String,
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days
  },
  completedAt: Date,
  failedAt: Date
});

export default mongoose.model("WebhookEvent", webhookEventSchema);
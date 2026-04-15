// In models/tokenTransactionModel.js
import mongoose from "mongoose";

const tokenTransactionSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  amount: Number,
  type: { 
    type: String, 
    enum: ["bonus", "email", "purchase", "usage"] 
  },
  note: String,
  invoiceId: { 
    type: String, 
    unique: true, 
    sparse: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Compound index for idempotency
tokenTransactionSchema.index({ user: 1, invoiceId: 1, type: 1 });

export default mongoose.model("TokenTransaction", tokenTransactionSchema);
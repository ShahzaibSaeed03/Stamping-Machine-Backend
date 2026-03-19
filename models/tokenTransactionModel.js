import mongoose from "mongoose";

const tokenTransactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ["bonus", "purchase", "usage", "admin", "email"],
      required: true
    },
    note: String,
    invoiceId: {
      type: String
    }
  },
  { timestamps: true }
);

/* 🚨 CRITICAL UNIQUE INDEX */
tokenTransactionSchema.index(
  { user: 1, invoiceId: 1, type: 1 },
  { unique: true, partialFilterExpression: { invoiceId: { $exists: true } } }
);

export default mongoose.model("TokenTransaction", tokenTransactionSchema);
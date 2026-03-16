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
    enum: ["bonus", "purchase", "usage", "admin"],
    required: true
  },

  workId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Work",
    default: null
  },

  note: String,

  invoiceId: {
    type: String,
    index: true
  }
}
);

export default mongoose.model("TokenTransaction", tokenTransactionSchema);
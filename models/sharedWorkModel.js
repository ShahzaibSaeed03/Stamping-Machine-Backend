import mongoose from "mongoose";

const sharedWorkSchema = new mongoose.Schema({
  id_work: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Work",
    required: true,
  },
  end_date: { type: Date, required: true }, // auto-delete after this date
  sha256_string: { type: String, required: true },
});

const SharedWork = mongoose.model("SharedWork", sharedWorkSchema);
export default SharedWork;

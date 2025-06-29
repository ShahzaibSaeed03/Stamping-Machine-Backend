import mongoose from "mongoose";

const workSchema = new mongoose.Schema({
  id_client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }, // id of owner/client (will be pk of user)
  id_category: { type: Number }, // No referenced table shown; treat as Number or Enum
  number_for_client: { type: Number, required: true }, // starts from 1 per client
  displayed_ID: { type: String, required: true, unique: true }, // e.g., ClientID + Registration Date (From table Certificate) + number_for_client (above column name)
  status: { type: Boolean, default: true }, // true = Active, false = Deleted
  title: { type: String, required: true },
  copyright_owner: { type: String, required: true },
  additional_copyright_owners: { type: String },
  registration_date: { type: Date, default: Date.now },
  file_name: { type: String, required: true },
  file_fingerprint: { type: String, required: true },
  id_file: { type: String, required: true }, // S3 file key or link
  id_certificate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Certificate",
    required: true,
  },
});

const Work = mongoose.model("Work", workSchema);

export default Work;

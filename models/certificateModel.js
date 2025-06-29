import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema({
  certificate_name: { type: String, required: true }, // displayed_id of the work
  registration_date: { type: Date, default: Date.now },
  TSA: { type: String }, // Time Stamping Authority
  id_file: { type: String, required: true }, // S3 link to certificate PDF
});

const Certificate = mongoose.model("Certificate", certificateSchema);

export default Certificate;

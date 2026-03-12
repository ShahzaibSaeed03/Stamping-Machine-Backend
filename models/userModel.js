import mongoose from "mongoose";

const userSchema = mongoose.Schema(
{
  userSeq: { type: Number, unique: true, index: true },

  firstName: { type: String, required: true },
  lastName: { type: String, required: true },

  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  companyName: String,
  ownerName: String,

  country: String,
  state: String,

  personalAddress: {
    address1: String,
    address2: String,
    zip: String,
    city: String,
    state: String,
    country: String,
    phone: String,
    profession: String,
    refSource: String
  },

  billing: {
    company: String,
    name: String,
    vatNumber: String,
    address1: String,
    address2: String,
    zip: String,
    city: String,
    state: String,
    country: String,
    phone: String,
    sameAsPersonal: Boolean
  },

  subscriptionStatus: {
    type: String,
    enum: [
      "inactive", 
      "active", 
      "expired", 
      "canceled",
      "incomplete",
      "incomplete_expired",
      "past_due",
      "trialing",
      "unpaid",
      "paused"
    ],
    default: "inactive"
  },

  subscriptionStart: Date,
  subscriptionEnd: Date,

  autoRenew: {
    type: Boolean,
    default: false
  },

  stripeCustomerId: { type: String, index: true },
  stripeSubscriptionId: { type: String, index: true },

  tokens: { type: Number, default: 0 },

  tokenVersion: { type: Number, default: 0 },

  emailChangeTemp: String,
  emailChangeCode: String,
  emailChangeExpires: Date

},
{ timestamps: true }
);

export default mongoose.model("User", userSchema);
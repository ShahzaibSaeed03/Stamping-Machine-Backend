import mongoose from "mongoose";

const userSchema = mongoose.Schema(
{
  userSeq: { type: Number, unique: true },

  /* BASIC */

  firstName: { type: String, required: true },
  lastName: { type: String, required: true },

  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  companyName: String,
  ownerName: String,

  country: String,
  state: String,

  /* PERSONAL DETAILS */

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

  /* BILLING */

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

  /* SUBSCRIPTION */

  subscriptionStatus: {
    type: String,
    enum: ["inactive", "active", "expired", "canceled"],
    default: "inactive"
  },

  subscriptionStart: Date,
  subscriptionEnd: Date,

  autoRenew: {
    type: Boolean,
    default: true
  },

  stripeCustomerId: String,
  stripeSubscriptionId: String,

  /* TOKENS */

  tokens: { type: Number, default: 0 },

  /* EMAIL CHANGE */

  emailChangeTemp: String,
  emailChangeCode: String,
  emailChangeExpires: Date
},
{ timestamps: true }
);

export default mongoose.model("User", userSchema);
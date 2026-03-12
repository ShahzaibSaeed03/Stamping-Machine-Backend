import Stripe from "stripe";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/userModel.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const sub = await stripe.subscriptions.retrieve(
  "sub_1TA6CKDxGM1NMeB9I3SBCNIZ"
);

console.log("Stripe start_date:", sub.start_date);

const start = new Date(sub.start_date * 1000);

/* yearly plan */
const end = new Date(start);
end.setFullYear(end.getFullYear() + 1);

console.log("Calculated start:", start);
console.log("Calculated end:", end);

await User.updateOne(
  { stripeSubscriptionId: sub.id },
  {
    subscriptionStart: start,
    subscriptionEnd: end
  }
);

console.log("Subscription dates corrected");

process.exit();
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import Stripe from "stripe";

/* ================= SUBSCRIPTION INFO ================= */

export const getSubscriptionInfo = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id).select(
    "subscriptionStatus subscriptionStart subscriptionEnd autoRenew tokens"
  );

  res.json(user);
});

/* ================= CANCEL AUTO RENEW ================= */

export const cancelSubscription = asyncHandler(async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(400);
    throw new Error("Stripe not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const user = await User.findById(req.user._id);

  if (!user || !user.stripeSubscriptionId) {
    res.status(404);
    throw new Error("No active subscription");
  }

  /* cancel renewal in Stripe */

  await stripe.subscriptions.update(
    user.stripeSubscriptionId,
    { cancel_at_period_end: true }
  );

  user.autoRenew = false;
  await user.save();

  res.json({
    message: "Subscription will cancel at period end"
  });
});

/* ================= CREATE CHECKOUT ================= */

export const createCheckoutSession = asyncHandler(async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(400);
    throw new Error("Stripe not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const user = await User.findById(req.user._id);
  if (!user) throw new Error("User not found");

  /* ================= CREATE CUSTOMER ONCE ================= */

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim()
    });

    customerId = customer.id;
    user.stripeCustomerId = customerId;
    await user.save();
  }

  /* ================= CREATE EMBEDDED CHECKOUT SESSION ================= */

  const session = await stripe.checkout.sessions.create({

    mode: "subscription",

    ui_mode: "embedded",                 // ⭐ REQUIRED FOR EMBEDDED

    customer: customerId,

    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }
    ],

    metadata: {
      userId: user._id.toString()
    },

    return_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`

  });

  /* ================= RETURN CLIENT SECRET ================= */

  res.json({
    clientSecret: session.client_secret
  });

});

export const resumeSubscription = asyncHandler(async (req, res) => {

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const user = await User.findById(req.user._id);

  if (!user?.stripeSubscriptionId) throw new Error("No subscription");

  await stripe.subscriptions.update(
    user.stripeSubscriptionId,
    { cancel_at_period_end: false }
  );

  user.autoRenew = true;
  await user.save();

  res.json({ message: "Subscription resumed" });
});
export const getInvoices = asyncHandler(async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(400);
    throw new Error("Stripe not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const user = await User.findById(req.user._id);

  if (!user?.stripeCustomerId) {
    return res.json([]);
  }

  const invoices = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit: 20
  });

  const formatted = invoices.data.map(inv => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    currency: inv.currency,
    status: inv.status,
    invoicePdf: inv.invoice_pdf,
    hostedInvoiceUrl: inv.hosted_invoice_url,
    date: inv.created
  }));

  res.json(formatted);
});


export const setDefaultPaymentMethod = asyncHandler(async (req,res)=>{

  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const user=await User.findById(req.user._id);

  const { paymentMethodId }=req.body;

  if(!user?.stripeCustomerId) throw new Error("No customer");

  /* attach */
  await stripe.paymentMethods.attach(paymentMethodId,{
    customer:user.stripeCustomerId
  });

  /* set default */
  await stripe.customers.update(user.stripeCustomerId,{
    invoice_settings:{
      default_payment_method:paymentMethodId
    }
  });

  res.json({success:true});
});
export const getCurrentCard = asyncHandler(async (req, res) => {

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const user = await User.findById(req.user._id);

  if (!user?.stripeCustomerId) return res.json(null);

  const methods = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: "card"
  });

  if (!methods.data.length) return res.json(null);

  const card = methods.data[0].card;

  res.json({
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year
  });
});

export const createSetupIntent = asyncHandler(async (req, res) => {

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const user = await User.findById(req.user._id);

  const intent = await stripe.setupIntents.create({
    customer: user.stripeCustomerId
  });

  res.json({ clientSecret: intent.client_secret });
});


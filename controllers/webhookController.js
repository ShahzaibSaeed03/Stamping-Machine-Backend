import Stripe from "stripe";
import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";
import WebhookEvent from "../models/webhookEventModel.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";
import { sendSalesEmail } from "../utils/sendSalesEmail.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= IDEMPOTENCY WITH BETTER LOGGING ================= */
async function isDuplicateEvent(eventId) {
  try {
    const result = await WebhookEvent.create({ 
      eventId,
      status: 'processing',
      createdAt: new Date()
    });
    console.log(`✅ Event ${eventId} marked as processing`);
    return false;
  } catch (error) {
    // Check if it's a duplicate key error
    if (error.code === 11000) {
      console.log(`⚠️ Event ${eventId} already exists in database - SKIPPING`);
      return true;
    }
    // If it's some other error, log it but don't skip
    console.error(`❌ Error checking duplicate for ${eventId}:`, error.message);
    return false;
  }
}

/* ================= MARK EVENT AS COMPLETED ================= */
async function markEventCompleted(eventId) {
  try {
    await WebhookEvent.updateOne(
      { eventId },
      { 
        status: 'completed',
        completedAt: new Date()
      }
    );
    console.log(`✅ Event ${eventId} marked as completed`);
  } catch (error) {
    console.error(`❌ Error marking event ${eventId} as completed:`, error.message);
  }
}

/* ================= MARK EVENT AS FAILED ================= */
async function markEventFailed(eventId, errorMessage) {
  try {
    await WebhookEvent.updateOne(
      { eventId },
      { 
        status: 'failed',
        error: errorMessage,
        failedAt: new Date()
      }
    );
    console.log(`❌ Event ${eventId} marked as failed`);
  } catch (error) {
    console.error(`❌ Error marking event ${eventId} as failed:`, error.message);
  }
}

/* ================= ATOMIC TOKEN ================= */
async function addTokensAtomic(userId, amount, invoiceId, type = "bonus") {
  try {
    console.log(`💎 Attempting to add ${amount} tokens (${type}) for user ${userId}`);
    
    const result = await TokenTransaction.updateOne(
      { user: userId, invoiceId, type },
      {
        $setOnInsert: {
          user: userId,
          amount,
          type,
          note: type === "bonus" ? "Subscription bonus" : "Token purchase",
          invoiceId,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount === 0) {
      console.log(`⚠️ Tokens already added for invoice ${invoiceId} (${type})`);
      return false;
    }

    const updateResult = await User.updateOne(
      { _id: userId },
      { $inc: { tokens: amount } }
    );

    console.log(`✅ Tokens added: ${amount} (${type}) to user ${userId}. User updated: ${updateResult.modifiedCount > 0}`);
    return true;
  } catch (error) {
    console.error("❌ Error adding tokens:", error);
    throw error;
  }
}

/* ================= ATOMIC EMAIL ================= */
async function sendEmailAtomic(user, invoice, payload) {
  try {
    console.log(`📧 Attempting to send email for invoice ${invoice.id}`);
    
    const result = await TokenTransaction.updateOne(
      { user: user._id, invoiceId: invoice.id, type: "email" },
      {
        $setOnInsert: {
          user: user._id,
          type: "email",
          invoiceId: invoice.id,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount === 0) {
      console.log(`⚠️ Email already sent for invoice ${invoice.id}`);
      return;
    }

    await sendPaymentEmail(payload);

    await sendSalesEmail({
      userEmail: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Customer",
      amount: payload.amount,
      currency: payload.currency,
      type: payload.type,
      invoiceId: invoice.id,
      receiptUrl: payload.receiptUrl,
      nextBillingDate: payload.nextBillingDate
    });

    console.log(`✅ Email sent for invoice ${invoice.id}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}

/* ================= FIND OR CREATE USER ================= */
async function findOrCreateUser(customerId, invoice) {
  try {
    // Extract just the customer ID string
    const customerIdString = typeof customerId === 'string' ? customerId : customerId.id || customerId;
    
    console.log(`🔍 Looking for user with customer ID: ${customerIdString}`);
    
    // First try to find existing user
    let user = await User.findOne({ stripeCustomerId: customerIdString });
    
    if (user) {
      console.log(`✅ Found existing user: ${user.email} (ID: ${user._id})`);
      return user;
    }

    console.log(`⚠️ User not found for customer ${customerIdString}, attempting to create...`);

    // Get customer details from Stripe
    let customerEmail = null;
    let customerName = null;
    
    try {
      const customer = await stripe.customers.retrieve(customerIdString);
      if (!customer.deleted) {
        customerEmail = customer.email;
        customerName = customer.name;
        console.log(`📧 Customer email from Stripe: ${customerEmail}, Name: ${customerName}`);
      }
    } catch (error) {
      console.log("⚠️ Could not retrieve customer details:", error.message);
    }

    // Try to get subscription metadata
    let formData = null;
    
    if (invoice.subscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        
        if (subscription.metadata?.formData) {
          formData = JSON.parse(subscription.metadata.formData);
          console.log("✅ Found form data in subscription metadata:", formData);
        }
      } catch (error) {
        console.log("⚠️ Could not retrieve subscription metadata:", error.message);
      }
    }

    // Create user with form data if available
    if (formData && formData.email) {
      console.log("📝 Creating user from form data...");
      const hashedPassword = await bcrypt.hash(formData.password || "TempPass123!", 10);

      user = await User.create({
        firstName: formData.firstName || customerName?.split(' ')[0] || "Customer",
        lastName: formData.lastName || customerName?.split(' ').slice(1).join(' ') || "User",
        email: formData.email,
        password: hashedPassword,
        companyName: formData.companyName || "",
        country: formData.country || "",
        stripeCustomerId: customerIdString,
        subscriptionStatus: "inactive",
        tokens: 0,
        createdAt: new Date()
      });

      console.log(`✅ Created user from metadata: ${user.email} (ID: ${user._id})`);
      return user;
    }

    // Check if email already exists
    if (customerEmail) {
      const existingEmail = await User.findOne({ email: customerEmail });
      if (existingEmail) {
        console.log(`📧 Email ${customerEmail} already exists, linking to Stripe customer`);
        existingEmail.stripeCustomerId = customerIdString;
        await existingEmail.save();
        console.log(`✅ Linked existing email to customer: ${customerEmail} (ID: ${existingEmail._id})`);
        return existingEmail;
      }
    }

    // Create user with Stripe customer data
    console.log("📝 Creating user from Stripe customer data...");
    const email = customerEmail || `pending_${customerIdString.slice(-8)}@temp.com`;
    const nameParts = (customerName || "Customer User").split(' ');
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(' ') || "User";
    
    // Generate a random password for the user
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    user = await User.create({
      firstName: firstName,
      lastName: lastName,
      email: email,
      password: hashedPassword,
      companyName: "",
      country: "",
      stripeCustomerId: customerIdString,
      subscriptionStatus: "inactive",
      tokens: 0,
      createdAt: new Date()
    });

    console.log(`✅ Created user from Stripe data: ${user.email} (ID: ${user._id})`);
    console.log(`🔑 Temporary password generated for ${user.email}`);
    
    return user;

  } catch (error) {
    console.error("❌ Error in findOrCreateUser:", error);
    
    // Ultimate fallback - create minimal user with required fields
    console.log("🚨 Creating ultimate fallback user...");
    const customerIdString = typeof customerId === 'string' ? customerId : customerId.id || String(customerId);
    const timestamp = Date.now();
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    
    try {
      const fallbackUser = await User.create({
        firstName: "Customer",
        lastName: String(timestamp),
        email: `customer_${timestamp}@temp.com`,
        password: hashedPassword,
        stripeCustomerId: customerIdString,
        subscriptionStatus: "inactive",
        tokens: 0,
        createdAt: new Date()
      });
      
      console.log(`✅ Created fallback user: ${fallbackUser.email} (ID: ${fallbackUser._id})`);
      return fallbackUser;
    } catch (fallbackError) {
      console.error("❌ Even fallback user creation failed:", fallbackError);
      throw fallbackError;
    }
  }
}

/* ================= DETECT PAYMENT TYPE ================= */
function detectPaymentType(invoice) {
  const billingReason = invoice.billing_reason;
  const line = invoice.lines?.data?.[0];
  
  // Check if it's a subscription payment
  const isSubscription = [
    "subscription_create",
    "subscription_cycle",
    "subscription_update"
  ].includes(billingReason);
  
  // Check if it's a token purchase
  const isTokenPurchase = 
    billingReason === "manual" ||
    invoice.metadata?.type === "token_purchase" ||
    (line?.description && 
     (line.description.toLowerCase().includes("token") ||
      line.description.toLowerCase().includes("credit"))) ||
    (line?.price?.metadata?.type === "token_purchase");
  
  console.log(`🔍 Payment detection - Reason: ${billingReason}, IsSub: ${isSubscription}, IsToken: ${isTokenPurchase}`);
  
  return {
    isSubscription,
    isTokenPurchase,
    primaryType: isSubscription ? "subscription" : (isTokenPurchase ? "token_purchase" : "other")
  };
}

/* ================= MAIN WEBHOOK ================= */
export const stripeWebhook = async (req, res) => {
  let event;
  const sig = req.headers["stripe-signature"];

  try {
    // IMPORTANT: req.body should be raw buffer, not parsed JSON
    const rawBody = req.body;
    
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📨 Webhook received: ${event.type} - ${event.id}`);
    console.log(`${'='.repeat(50)}\n`);
    
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  /* ✅ Prevent duplicate execution */
  const isDuplicate = await isDuplicateEvent(event.id);
  if (isDuplicate) {
    console.log(`⚠️ Duplicate event ${event.id} - SKIPPING PROCESSING`);
    return res.json({ received: true });
  }

  /* ✅ Respond immediately to Stripe */
  res.json({ received: true });

  // Process asynchronously
  setImmediate(async () => {
    try {
      switch (event.type) {

        /* ================= PAYMENT SUCCESS ================= */
        case "invoice.payment_succeeded": {
          const invoice = event.data.object;

          console.log(`\n${'🔥'.repeat(20)}`);
          console.log(`🔥 PROCESSING PAYMENT`);
          console.log(`🔥 Invoice: ${invoice.id}`);
          console.log(`🔥 Amount: ${invoice.amount_paid / 100} ${invoice.currency}`);
          console.log(`🔥 Customer ID: ${invoice.customer}`);
          console.log(`${'🔥'.repeat(20)}\n`);

          // Get full invoice with subscription data
          const fullInvoice = await stripe.invoices.retrieve(invoice.id, {
            expand: ["subscription"]
          });

          // Pass only the customer ID string
          const customerId = fullInvoice.customer;
          
          // Find or create user
          const user = await findOrCreateUser(customerId, fullInvoice);

          if (!user) {
            console.error("❌ Failed to find or create user");
            await markEventFailed(event.id, "Failed to find or create user");
            return;
          }

          console.log(`\n✅ User ready: ${user.email} (ID: ${user._id})\n`);

          /* ================= DETECT PAYMENT TYPE ================= */
          const { isSubscription, isTokenPurchase, primaryType } = detectPaymentType(fullInvoice);
          
          console.log(`📋 Payment type: ${primaryType} (Subscription: ${isSubscription}, Token: ${isTokenPurchase})`);

          let paymentType = "Other";
          
          /* ================= PROCESS SUBSCRIPTION ================= */
          if (isSubscription) {
            paymentType = "Subscription";
            
            console.log(`🎯 Processing subscription payment...`);
            
            // Add bonus tokens for subscription
            await addTokensAtomic(user._id, 5, fullInvoice.id, "bonus");

            // Update subscription dates
            const line = fullInvoice.lines?.data?.[0];
            let startDate = null;
            let endDate = null;

            if (line?.period?.start && line?.period?.end) {
              startDate = new Date(line.period.start * 1000);
              endDate = new Date(line.period.end * 1000);
            }

            // Update user subscription status
            user.subscriptionStatus = "active";
            if (startDate) user.subscriptionStart = startDate;
            if (endDate) user.subscriptionEnd = endDate;
            user.stripeSubscriptionId = fullInvoice.subscription;

            await user.save();

            console.log(`✅ Subscription activated for user: ${user.email}`);
            console.log(`📅 Next billing: ${endDate?.toISOString() || "N/A"}`);
          }

          /* ================= PROCESS TOKEN PURCHASE ================= */
          if (isTokenPurchase && !isSubscription) {
            paymentType = "Token Purchase";
            
            console.log(`🎯 Processing token purchase...`);
            
            const tokens = fullInvoice.amount_paid / 100; // $1 = 1 token

            await addTokensAtomic(user._id, tokens, fullInvoice.id, "purchase");

            console.log(`✅ Tokens purchased: ${tokens} for user: ${user.email}`);
          }

          /* ================= SEND EMAILS ================= */
          console.log(`📧 Preparing to send emails...`);
          
          const nextBillingDate = user.subscriptionEnd || 
            (fullInvoice.lines?.data[0]?.period?.end 
              ? new Date(fullInvoice.lines.data[0].period.end * 1000) 
              : null);

          await sendEmailAtomic(user, fullInvoice, {
            email: user.email,
            amount: fullInvoice.amount_paid / 100,
            currency: fullInvoice.currency.toUpperCase(),
            type: paymentType,
            receiptUrl: fullInvoice.hosted_invoice_url,
            nextBillingDate: nextBillingDate
          });

          console.log(`\n${'✅'.repeat(20)}`);
          console.log(`✅ Payment processing complete for invoice: ${fullInvoice.id}`);
          console.log(`${'✅'.repeat(20)}\n`);
          
          await markEventCompleted(event.id);
          break;
        }

        /* ================= SUBSCRIPTION UPDATED ================= */
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          
          console.log(`🔄 Processing subscription update: ${subscription.id}`);
          
          const user = await User.findOne({
            stripeSubscriptionId: subscription.id
          });

          if (user) {
            user.subscriptionStatus = subscription.status;
            
            if (subscription.current_period_start) {
              user.subscriptionStart = new Date(subscription.current_period_start * 1000);
            }
            
            if (subscription.current_period_end) {
              user.subscriptionEnd = new Date(subscription.current_period_end * 1000);
            }

            await user.save();
            
            console.log(`✅ Subscription updated for user: ${user.email}`);
            console.log(`📊 Status: ${subscription.status}`);
          }
          
          await markEventCompleted(event.id);
          break;
        }

        /* ================= SUBSCRIPTION DELETED/CANCELED ================= */
        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          
          console.log(`❌ Processing subscription cancellation: ${subscription.id}`);

          const user = await User.findOne({
            stripeSubscriptionId: subscription.id
          });

          if (user) {
            user.subscriptionStatus = "canceled";
            await user.save();
            
            console.log(`❌ Subscription canceled for user: ${user.email}`);
          }

          await markEventCompleted(event.id);
          break;
        }

        /* ================= PAYMENT FAILED ================= */
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          
          console.log(`❌ Payment failed for invoice: ${invoice.id}`);
          console.log(`👤 Customer: ${invoice.customer}`);
          
          // Update user subscription status if needed
          const user = await User.findOne({ stripeCustomerId: invoice.customer });
          if (user) {
            user.subscriptionStatus = "past_due";
            await user.save();
            console.log(`⚠️ Updated user ${user.email} status to past_due`);
          }
          
          await markEventCompleted(event.id);
          break;
        }

        default:
          // Only log important events
          if (!event.type.includes('tax_rate') && 
              !event.type.includes('payment_method') && 
              !event.type.includes('charge') &&
              !event.type.includes('payment_intent') &&
              !event.type.includes('checkout.session')) {
            console.log(`ℹ️ Unhandled event type: ${event.type}`);
          }
          // Mark as completed for unhandled events too
          await markEventCompleted(event.id);
      }

    } catch (err) {
      console.error("\n❌❌❌ WEBHOOK PROCESSING ERROR ❌❌❌");
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
      console.error("Event ID:", event.id);
      console.error("Event Type:", event.type);
      console.error("❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n");
      
      await markEventFailed(event.id, err.message);
    }
  });
};
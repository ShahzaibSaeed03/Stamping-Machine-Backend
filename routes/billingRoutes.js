import express from "express";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";

import {
  getSubscriptionInfo,
  cancelSubscription,
  createCheckoutSession,
  getReceipts,
  resumeSubscription,
  getCurrentCard,
  createSetupIntent,
  setDefaultPaymentMethod,
  checkoutSuccess
} from "../controllers/billingController.js";

const router = express.Router();

router.get("/subscription", userAuthMiddleware, getSubscriptionInfo);

router.put("/cancel", userAuthMiddleware, cancelSubscription);

router.post(
  "/subscription-checkout",
  userAuthMiddleware,   // ✅ FIX
  createCheckoutSession
);
router.get("/checkout-success", checkoutSuccess);

router.get("/invoices", userAuthMiddleware, getReceipts);

router.post("/resume", userAuthMiddleware, resumeSubscription);

router.get("/card", userAuthMiddleware, getCurrentCard);

router.post("/card/setup-intent", userAuthMiddleware, createSetupIntent);

router.post("/set-default-card", userAuthMiddleware, setDefaultPaymentMethod);

export default router;
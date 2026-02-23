import express from "express";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";
import { getSubscriptionInfo, cancelSubscription, createCheckoutSession, getInvoices, resumeSubscription, getCurrentCard, createSetupIntent } from "../controllers/billingController.js";

const router = express.Router();

router.get("/subscription", userAuthMiddleware, getSubscriptionInfo);
router.put("/cancel", userAuthMiddleware, cancelSubscription);
router.post("/subscription-checkout", userAuthMiddleware, createCheckoutSession);
router.get("/invoices", userAuthMiddleware, getInvoices);
router.post("/resume", userAuthMiddleware, resumeSubscription);
router.get("/card", userAuthMiddleware, getCurrentCard);
router.post("/card/setup-intent", userAuthMiddleware, createSetupIntent);

export default router;
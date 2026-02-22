import express from "express";
import { stripeWebhook } from "../controllers/webhookController.js";

const router = express.Router();

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

export default router;
import express from "express";
import { getSubscriptionStatus } from "../controllers/subscriptionController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/status", userAuthMiddleware, getSubscriptionStatus);
export default router;
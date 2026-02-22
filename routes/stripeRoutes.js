import express from "express";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";
import { createTokenCheckout } from "../controllers/tokenCheckoutController.js";

const router = express.Router();

router.post("/create-checkout-session/:qty", userAuthMiddleware, createTokenCheckout);

export default router;
import express from "express";
import { getTokenHistory, testAddTokens } from "../controllers/tokenController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";
import { buyTokens } from "../controllers/tokenController.js";
import subscriptionGuard from "../middlewares/subscriptionGuard.js";

const router = express.Router();

router.get("/history", userAuthMiddleware, getTokenHistory);
router.post("/test-add", userAuthMiddleware, testAddTokens);
router.post(
    "/buy",
    userAuthMiddleware,
    subscriptionGuard,
    buyTokens
);
export default router;
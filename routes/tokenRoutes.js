import express from "express";
import { getTokenHistory , testAddTokens } from "../controllers/tokenController.js";
import { userAuthMiddleware  } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/history", userAuthMiddleware, getTokenHistory);
router.post("/test-add", userAuthMiddleware, testAddTokens);
export default router;
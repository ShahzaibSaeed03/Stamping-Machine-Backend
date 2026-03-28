import express from "express";
import {

  allUser,
} from "../controllers/userController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";
import { getProfile, updateProfile, changePassword, requestEmailChange,verifyEmailChange } from "../controllers/userController.js";

const router = express.Router();

router.get("/", userAuthMiddleware, allUser);
router.put("/profile", userAuthMiddleware, updateProfile);
router.get("/profile", userAuthMiddleware, getProfile);
router.put("/change-password", userAuthMiddleware, changePassword);
router.put("/change-email", userAuthMiddleware, requestEmailChange);
router.put("/verify-email", userAuthMiddleware, verifyEmailChange);
export default router;

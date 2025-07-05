import express from "express";
import {
  registerUser,
  loginUser,
  allUser,
} from "../controllers/userController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", userAuthMiddleware, allUser);
router.route("/").post(registerUser);
router.post("/login", loginUser);

export default router;

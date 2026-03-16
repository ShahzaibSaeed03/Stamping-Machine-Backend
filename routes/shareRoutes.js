import express from "express";
import {
  createShareLink,
  getSharedWork,
  listWorkShares,
  deleteShare,
  setSharePassword,
  accessByReference
} from "../controllers/shareController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Protected routes
router.post("/create", userAuthMiddleware, createShareLink);
router.get("/list/:workId", userAuthMiddleware, listWorkShares);
router.delete("/:shareId", userAuthMiddleware, deleteShare);
router.post("/set-password", userAuthMiddleware, setSharePassword);

// Public routes
router.post("/access-by-reference", accessByReference);

// Share link access (no password)
router.get("/:shareId", getSharedWork);

export default router;
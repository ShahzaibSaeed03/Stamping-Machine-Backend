import express from "express";
import {
  createShareLink,
  getSharedWork,
  listWorkShares,
  deleteShare
} from "../controllers/shareController.js";
import { userAuthMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Share management routes - require authentication
router.post("/create", userAuthMiddleware, createShareLink);
router.get("/list/:workId", userAuthMiddleware, listWorkShares);
router.delete("/:shareId", userAuthMiddleware, deleteShare);

// Public share access route - no auth required, but POST to handle password in body
router.post("/access/:shareId", getSharedWork);

export default router; 
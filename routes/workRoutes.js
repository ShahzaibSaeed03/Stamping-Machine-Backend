import express from "express";
import { uploadWork, verifyWorkRegistration, getAllWorks, getWorksByUser } from "../controllers/workController.js";
import {uploadMiddleware, validateSingleZipAndContents, verifyUploadMiddleware} from "../middlewares/uploadMiddleware.js";
import multerErrorMiddleware from "../middlewares/multerErrorHandlerMiddleware.js";
import {userAuthMiddleware} from "../middlewares/authMiddleware.js"

const router = express.Router();

// Get all works
router.get("/", userAuthMiddleware, getAllWorks);

// Get works for a specific user
router.get("/user/:userId", userAuthMiddleware, getWorksByUser);

// Use the uploadMiddleware for file uploads
router.post(
  "/upload",
  userAuthMiddleware,
  uploadMiddleware.single("file"),
  multerErrorMiddleware, // To handle error
  validateSingleZipAndContents, // To check the zip file content
  uploadWork
);

// Verification route
router.post(
  "/verify",
  userAuthMiddleware,
  verifyUploadMiddleware,
  multerErrorMiddleware,
  verifyWorkRegistration
);

export default router;

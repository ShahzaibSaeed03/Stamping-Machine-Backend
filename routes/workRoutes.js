import express from "express";
import { uploadWork, verifyWorkRegistration, getAllWorks } from "../controllers/workController.js";
import {uploadMiddleware, validateSingleZipAndContents, verifyUploadMiddleware} from "../middlewares/uploadMiddleware.js";
import multerErrorMiddleware from "../middlewares/multerErrorHandlerMiddleware.js";
import {userAuthMiddleware} from "../middlewares/authMiddleware.js"

const router = express.Router();

// Get all works
router.get("/", userAuthMiddleware, getAllWorks);

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

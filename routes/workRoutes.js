import express from "express";
import { uploadWork } from "../controllers/workController.js";
import {uploadMiddleware, validateSingleZipAndContents} from "../middlewares/uploadMiddleware.js";
import multerErrorMiddleware from "../middlewares/multerErrorHandlerMiddleware.js";
import {userAuthMiddleware} from "../middlewares/authMiddleware.js"

const router = express.Router();

// Use the uploadMiddleware for file uploads
router.post(
  "/upload",
  userAuthMiddleware,
    uploadMiddleware.single("file"),
  multerErrorMiddleware, // To handle error
  validateSingleZipAndContents, // To check the zip file content
  uploadWork
);

export default router;

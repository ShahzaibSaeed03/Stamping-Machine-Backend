import express from "express";
import { uploadWork } from "../controllers/workController.js";
import uploadMiddleware from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// Use the uploadMiddleware for file uploads
router.post("/upload", uploadMiddleware.single("file"), uploadWork);

export default router;
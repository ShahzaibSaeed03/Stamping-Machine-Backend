import express from "express";
import { contactUs } from "../controllers/contactController.js";

const router = express.Router();

router.post("/contact", contactUs);

export default router;
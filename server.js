import dotenv from "dotenv";
dotenv.config({ path: "./.env" }); // ⭐ MUST be first

import express from "express";
import colors from "colors";
import cors from "cors";
import fs from "fs";
import path from "path";

import connectDB from "./config/conn.js";

import userRoutes from "./routes/userRoutes.js";
import workRoutes from "./routes/workRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import tokenRoutes from "./routes/tokenRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";

import { notFound, errorHandler } from "./middlewares/errorMiddlewares.js";

// Ensure upload folder exists
const uploadDir = path.join(process.cwd(), "work-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Connect DB
connectDB();

const app = express();
const port = process.env.PORT || 5000;

// CORS
const corsOptions = {
  origin: [
    "http://localhost:4200",
    "http://localhost:4100",
    "https://mycopyrightally.com",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Stripe webhook raw body
app.use("/api/webhook/stripe", express.raw({ type: "application/json" }));

app.use(cors(corsOptions));
app.use(express.json());

// Health
app.get("/", (req, res) => {
  res.status(200).send("Welcome to Stamping App.");
});

// Routes
app.use("/api/works", workRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/webhook", webhookRoutes);

// Error middlewares
app.use(notFound);
app.use(errorHandler);

// Start
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`.magenta.bold);
});
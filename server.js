import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import colors from "colors";
import cors from "cors";
import fs from "fs";
import path from "path";

import connectDB from "./config/conn.js";

/* ROUTES */
import contactRoutes from "./routes/contactRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import workRoutes from "./routes/workRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import tokenRoutes from "./routes/tokenRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";

/* WEBHOOK CONTROLLER (IMPORTANT) */
import { stripeWebhook } from "./controllers/webhookController.js";

import { notFound, errorHandler } from "./middlewares/errorMiddlewares.js";

const app = express();
const port = process.env.PORT || 5000;
const __dirname = path.resolve();

/* ================= DB ================= */
connectDB();

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:4200",
  "http://localhost:4100",
  "https://mycopyrightally.com",
  "https://www.mycopyrightally.com",
  "https://instagrace.com",
  "https://www.instagrace.com",
  "https://coral-app-9b72d189-1c28-4012-89ab-e15c0f593b39.ondigitalocean.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS not allowed: " + origin));
    },
    credentials: true
  })
);

/* =========================================================
   ✅ STRIPE WEBHOOK (CRITICAL - MUST BE BEFORE express.json)
   ========================================================= */

app.post(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/* ================= JSON PARSER ================= */
app.use(express.json());

/* ================= ROUTES ================= */
app.use("/api/works", workRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api", contactRoutes);

/* ================= ERRORS ================= */
app.use(notFound);
app.use(errorHandler);

/* ================= START ================= */
app.listen(port, () => {
  console.log(`🚀 Server running → http://localhost:${port}`.magenta.bold);
});
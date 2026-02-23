import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import subscriptionRoutes from "./routes/subscriptionRoutes.js";

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

const app = express();
const port = process.env.PORT || 5000;
const __dirname = path.resolve();

/* ensure upload folder */
const uploadDir = path.join(process.cwd(), "work-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* DB */
connectDB();

/* static public */
app.use(express.static(path.join(__dirname, "public")));

/* ROOT HOMEPAGE */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* CORS */
const corsOptions = {
  origin: [
    "http://localhost:4200",
    "http://localhost:4100",
    "https://mycopyrightally.com",
  ],
  credentials: true,
};
app.use(cors(corsOptions));

/* Stripe raw */
app.use("/api/webhook/stripe", express.raw({ type: "application/json" }));

app.use(express.json());

/* Routes */
app.use("/api/works", workRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/webhook", webhookRoutes);

app.use("/api/subscription", subscriptionRoutes);
/* errors */
app.use(notFound);
app.use(errorHandler);

/* start */
app.listen(port, () => {
  console.log(`Server running → http://localhost:${port}`.magenta.bold);
});
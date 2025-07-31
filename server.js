import express from "express";
import colors from "colors";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/conn.js";
import userRoutes from "./routes/userRoutes.js";
import workRoutes from "./routes/workRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import { notFound, errorHandler } from "./middlewares/errorMiddlewares.js";

dotenv.config();
connectDB();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:4200',
    'http://localhost:4100'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json()); // To accept the json data

// GENERAL
app.get("/", (req, res) => {
  res.status(200).send("Welcome to Stamping App.");
});

app.use("/api/users", userRoutes);
app.use("/api/works", workRoutes);
app.use("/api/shares", shareRoutes);


// MIDDLEWARES
app.use(notFound);
app.use(errorHandler); 

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`.magenta.bold);
});

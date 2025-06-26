import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";

const protect = asyncHandler(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      req.user = await User.findById(decoded._id).select("-password");
      next();
    } catch (err) {
      res.status(401);
      next(new Error("Not an authorized User. Invalid or expired token."));
    }
  } else {
    res.status(401);
    next(new Error("Not an authorized User. No token."));
  }
});

export { protect };

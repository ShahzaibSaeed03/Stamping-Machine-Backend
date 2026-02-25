import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";

const userAuthMiddleware = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

      const user = await User.findById(decoded._id).select("-password");

      if (!user) {
        res.status(401);
        throw new Error("User not found");
      }

      /* ⭐ ADD THIS — invalidate old tokens */
      if (decoded.tokenVersion !== user.tokenVersion) {
        res.status(401);
        throw new Error("Token expired. Please login again.");
      }

      req.user = user;
      next();

    } catch (err) {
      res.status(401);
      next(new Error("Not authorized. Token invalid or expired."));
    }
  } else {
    res.status(401);
    next(new Error("No token provided."));
  }
});

export { userAuthMiddleware };
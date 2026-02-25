import jwt from "jsonwebtoken";

const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      tokenVersion: user.tokenVersion,   // ⭐ important
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "30d" }
  );
};

export default generateToken;
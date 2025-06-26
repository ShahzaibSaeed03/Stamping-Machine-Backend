import jwt from "jsonwebtoken";

const generateToken = async (_id) => {
  const token = jwt.sign({ _id }, process.env.JWT_SECRET_KEY, {
    expiresIn: "30d",
  });
  return token;
};

export default generateToken;

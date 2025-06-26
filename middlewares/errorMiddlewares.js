const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    status: statusCode || 500,
    message: err.message || "Backend Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    path: req.originalUrl,
  });
};

export { notFound, errorHandler };

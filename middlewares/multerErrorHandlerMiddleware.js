const multerErrorMiddleware = (err, req, res, next) => {
  if (err) {
    // Rejection for specific extensions like .exe or .js
    if (err.message.includes(".exe") || err.message.includes("JavaScript")) {
      return res.status(400).json({
        error: "We don't accept .exe or .js files.",
      });
    }

    // Rejection due to size > 120 MB
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error:
          "The size of your file exceeds our 120 MB limit. Please compress your file before retrying.",
      });
    }

    // Handle multiple files error
    if (err.message && err.message.includes("Unexpected field")) {
      return res.status(400).json({
        error: "You can only upload one .zip file at a time. Please combine your files into a single .zip archive.",
      });
    }

    // Generic multer error
    return res.status(500).json({
      error: "File upload failed: " + err.message,
    });
  }
  // No error, continue
  next();
};

export default multerErrorMiddleware;

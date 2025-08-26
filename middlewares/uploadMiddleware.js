import multer from "multer";
import path from "path";

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "work-uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

// Only allow .zip or zip category files
const allowedZipMimes = [
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
  "application/x-compressed",
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".zip" || !allowedZipMimes.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only .zip files are allowed. Please upload your work as a .zip archive."
      ),
      false
    );
  }
  cb(null, true);
};

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 }, // 120 MB
  fileFilter,
});

// Middleware to enforce only one file and check zip contents
const validateSingleZipAndContents = (req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);

  if (!files || files.length === 0) {
    return res.status(400).json({
      error: "No files uploaded. Please select at least one file.",
    });
  }

  if (files.length !== 1) {
    return res.status(400).json({
      message:
        "You must upload exactly one .zip file. Please combine your work into a single .zip archive.",
    });
  }
  const file = files[0];

  // Check if the uploaded file itself is .exe or .js
  const fileExt = path.extname(file.originalname).toLowerCase();
  if (fileExt === ".exe" || fileExt === ".js") {
    return res.status(400).json({
      error: "We don't accept .exe or .js files. Please upload your work as a .zip archive.",
    });
  }

  next();
};

// Multer middleware for verification (accepts three files: file, certificate, ots)
const verifyUploadMiddleware = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
}).fields([
  { name: 'originalFile', maxCount: 1 },
  { name: 'certificate', maxCount: 1 },
  { name: 'ots', maxCount: 1 },
]);

export { uploadMiddleware, validateSingleZipAndContents, verifyUploadMiddleware };

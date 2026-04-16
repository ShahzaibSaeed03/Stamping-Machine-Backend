import multer from "multer";
import path from "path";
import fs from "fs";

/* ---------------- CREATE UPLOAD FOLDER ---------------- */
const uploadDir = path.resolve("work-uploads");

// ✅ Fix ENOENT error (important for server)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ---------------- STORAGE CONFIG ---------------- */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // ✅ use absolute path
  },
  filename: function (req, file, cb) {
    // ✅ prevent overwrite + safer filename
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

/* ---------------- FILE FILTER ---------------- */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".exe" || ext === ".js") {
    return cb(new Error(".js and .exe files are not accepted"), false);
  }

  cb(null, true);
};

/* ---------------- SINGLE FILE UPLOAD ---------------- */
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 }, // 120 MB
  fileFilter,
});

/* ---------------- VALIDATE SINGLE FILE ---------------- */
const validateSingleZipAndContents = (req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);

  if (!files || files.length === 0) {
    return res.status(400).json({
      error: "No file uploaded.",
    });
  }

  if (files.length !== 1) {
    return res.status(400).json({
      error: "Please upload exactly one file.",
    });
  }

  const file = files[0];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (fileExt === ".exe" || fileExt === ".js") {
    return res.status(400).json({
      error:
        "We don't accept .exe or .js files. Please upload your work as a .zip archive.",
    });
  }

  next();
};

/* ---------------- MULTI FILE (VERIFY) ---------------- */
const verifyUploadMiddleware = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter,
}).fields([
  { name: "originalFile", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "ots", maxCount: 1 },
]);

/* ---------------- EXPORTS ---------------- */
export {
  uploadMiddleware,
  validateSingleZipAndContents,
  verifyUploadMiddleware,
};
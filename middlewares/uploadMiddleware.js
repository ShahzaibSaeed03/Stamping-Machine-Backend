import multer from "multer";
import path from "path";
import AdmZip from "adm-zip";

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "work-uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
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
  try {
    const zip = new AdmZip(file.path);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const entryExt = path.extname(entry.entryName).toLowerCase();
      if (entryExt === ".exe" || entryExt === ".js") {
        return res.status(400).json({
          message:
            "Your zip file contains forbidden file types (.exe or .js). Please remove them and try again.",
        });
      }
    }
    next();
  } catch (err) {
    return res
      .status(400)
      .json({
        message:
          "Failed to process zip file. Please upload a valid .zip archive.",
      });
  }
};

export { uploadMiddleware, validateSingleZipAndContents };

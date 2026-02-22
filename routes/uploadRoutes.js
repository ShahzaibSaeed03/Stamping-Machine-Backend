import { uploadMiddleware, validateSingleZipAndContents } from "../middlewares/upload.js";

router.post(
  "/upload",
  userAuthMiddleware,
  subscriptionGuard,
  tokenGuard,
  uploadMiddleware.single("file"),  
  validateSingleZipAndContents,
  uploadController
);
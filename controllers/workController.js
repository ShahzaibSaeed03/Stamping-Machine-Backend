import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import { 
  validateFile, 
  computeSHA256, 
  generateDisplayedID, 
  generateCertificatePDF, 
  sendToTSA 
} from "../utils/WorkController/helperFunctionsWorkController.js";
import { uploadToAWS } from "../utils/WorkController/uploadToAWS.js";
import { saveToDatabase } from "../utils/WorkController/saveToDatabase.js";
import { sendConfirmationEmail } from "../utils/WorkController/sendConfirmationEmail.js";

// WORK CONTROLLER
const uploadWork = asyncHandler(async (req, res) => {
  const file = req.file; // from multer
  const user = req.user; // from auth middleware
  const { workTitle, additionalOwners } = req.body;

  console.log("file: ", file);
  console.log("worktitle: ", workTitle)
  console.log("additionalOwners: ", additionalOwners)

  res
  .status(201)
  .json({ message: "Work uploaded and registered"});

  // Step 1: Validate file
  validateFile(file);

  // Step 2: Compute SHA256 fingerprint
  const fingerprint = await computeSHA256(file.path);

  // Step 3: Calculate work counter and generate Displayed ID
  const workCounter = await Work.countDocuments({ user: user._id });
  const displayedID = await generateDisplayedID(user.clientId, workCounter);

  // Step 4: Generate Certificate PDF
  const certificatePath = await generateCertificatePDF({
    workTitle,
    user,
    additionalOwners,
    displayedID,
    fingerprint,
    originalFileName: file.originalname,
  });

  // Step 5: Send to TSA
  const tsaData = await sendToTSA(certificatePath);

  // Step 6: Upload all to AWS
  const s3Links = await uploadToAWS({
    originalFile: file.path,
    certificateFile: certificatePath,
    otsFile: tsaData.otsFilePath,
    displayedID,
  });

  // Step 7: Save to MongoDB
  const workData = await saveToDatabase({
    user,
    workTitle,
    additionalOwners,
    displayedID,
    fingerprint,
    s3Links,
    tsaData,
    originalFileName: file.originalname,
  });

  // Step 8: Email confirmation to user
  await sendConfirmationEmail(user.email, workTitle);

  res
    .status(201)
    .json({ message: "Work uploaded and registered", work: workData });
});



export {uploadWork};
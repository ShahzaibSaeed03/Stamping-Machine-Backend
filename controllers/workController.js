import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import {
  computeSHA256,
  generateDisplayedID,
  generateCertificatePDF,
  sendToTSA,
} from "../utils/WorkController/helperFunctionsWorkController.js";
import { uploadToAWS } from "../utils/WorkController/uploadToAWS.js";
import { saveToDatabase } from "../utils/WorkController/saveToDatabase.js";
import { sendConfirmationEmail } from "../utils/WorkController/sendConfirmationEmail.js";
import { exec } from "child_process";

// WORK CONTROLLER
const uploadWork = asyncHandler(async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      error: "No file uploaded. Please select a .zip file to upload.",
    });
  }

  const user = req.user; // from auth middleware
  const { workTitle, copyrightOwner, additionalOwners } = req.body;
  

  // Step 2: Compute SHA256 fingerprint
  const fingerprint = await computeSHA256(file.path);
  
  // Step 3: Calculate work counter and generate Displayed ID
  const workCounter = await Work.countDocuments({ user: user._id });
  const displayedID = await generateDisplayedID(user._id, workCounter); // user._id is serve as clientId

  // Step 4: Generate Certificate PDF
  const certificatePath = await generateCertificatePDF({
    workTitle,
    copyrightOwner,
    user,
    additionalOwners,
    displayedID,
    fingerprint,
    originalFileName: file.originalname,
  });

  res.status(201).json({ message: "Work uploaded and  registered", fingerprint: fingerprint, workCounter, displayedID, certificatePath });

  return;


  // Step 5: Send to TSA
  // exec(`ots-cli.js stamp "${certificatePath}"`, (error, stdout, stderr) => {
  //   if (error) {
  //     console.error(`Error executing ots: ${error.message}`);
  //     return res.status(500).json({ error: "Error executing ots" });
  //   }

  //   const tsaData = {
  //     otsFilePath: certificatePath,
  //     stdout: stdout,
  //     stderr: stderr,
  //   };

  //   res.status(201).json({ message: "Work uploaded and  registered", fingerprint: fingerprint, workCounter, displayedID, certificatePath, tsaData });
  // });
  // return;
  
  // Step 6: Upload all to AWS
  const s3Links = await uploadToAWS({
    originalFile: file.path,
    certificateFile: certificatePath,
    otsFile: certificatePath,
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

  res.status(201).json({ message: "Work uploaded and registered", work: workData });
});

export { uploadWork };

import crypto from "crypto";
import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import { exec } from "child_process";

// VALIDATE FILE FUNCTION
export const validateFile = (file) => {
  const maxSize = 120 * 1024 * 1024; // 120 MB
  const forbiddenTypes = ["application/x-msdownload", "application/javascript"];

  if (!file) throw new Error("No file uploaded");
  if (file.size > maxSize) throw new Error("File exceeds 120 MB limit");
  if (forbiddenTypes.includes(file.mimetype)) {
    throw new Error("We don't accept .exe or JavaScript files");
  }
};

// SHA COMPUTE FUNCTION
export const computeSHA256 = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
};

// GENERATE DISPLAY ID FUNCTION
export const generateDisplayedID = async (clientId, workCounter) => {
  const today = new Date();
  const datePart = today
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")
    .slice(0, 6); // DDMMYY

  //   const count = await Work.countDocuments({ clientId });
  const nextNumber = (workCounter + 1).toString().padStart(4, "0");

  return `${clientId}${datePart}${nextNumber}`;
};

// GENERATE CERTIFICATE PDF FUNCTION
export const generateCertificatePDF = ({
  workTitle,
  user,
  additionalOwners,
  displayedID,
  fingerprint,
  originalFileName,
}) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const outputPath = path.join("certificates", `${displayedID}.pdf`);
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    doc
      .fontSize(14)
      .text(`The file below is copyrighted:\n\nWork Title:\n${workTitle}\n`);
    doc.text(`Copyright Owner: ${user.name}`);
    if (additionalOwners)
      doc.text(`Additional Copyright Owners: ${additionalOwners}`);
    doc.text(`Reference number: ${displayedID}`);
    doc.text(`Registration Date: ${new Date().toLocaleString()}`);
    doc.text(`Timestamping Authority: Open Timestamps`);
    doc.text(`Copyrighted File name: ${originalFileName}`);
    doc.text(`File SHA256 fingerprint:\n${fingerprint}`);

    doc.end();

    stream.on("finish", () => resolve(outputPath));
    stream.on("error", reject);
  });
};

// SEND TO TSA FUNCTION
export const sendToTSA = (certificatePath) => {
  return new Promise((resolve, reject) => {
    const otsPath = `${certificatePath}.ots`;

    exec(`ots stamp "${certificatePath}"`, (error, stdout, stderr) => {
      if (error) return reject(error);

      resolve({
        blockInfo: "Pending (get from opentimestamps when verified)",
        otsFilePath: otsPath,
      });
    });
  });
};

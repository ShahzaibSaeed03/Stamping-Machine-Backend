import crypto from "crypto";
import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import { exec } from "child_process";

// SHA256 fingerprint calculation for a file (used for timestamp) Only use this for files, not directories. Throws clear errors if file is missing or not a file.
export const computeSHA256 = (filePath) => {
  return new Promise((resolve, reject) => {
    // Check if file exists and is a file
    fs.stat(filePath, (err, stats) => { 
      if (err) {
        return reject(new Error(`File not found: ${filePath}`));
      }
      if (!stats.isFile()) {
        return reject(new Error(`Not a file: ${filePath}`));
      }
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(new Error(`Error reading file: ${err.message}`)));
    });
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
    const certificatesDir = path.join(process.cwd(), "certificates");
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    const outputPath = path.join(certificatesDir, `${displayedID}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Helper for key-value rows with spacing and wrapping
    const rowSpacing = 18;
    const keyWidth = 200; // px
    let y = doc.y;
    const fontSize = 14;
    doc.fontSize(fontSize);

    function drawRow(key, value) {
      doc.font("Helvetica-Bold").text(key + " : ", 50, y, { continued: true });
      doc.font("Helvetica").text(value, doc.x, y, {
        width: 500 - keyWidth,
        align: "left",
        indent: 0,
        continued: false,
      });
      y = doc.y + rowSpacing;
      doc.moveDown(0.2);
    }

    // Title
    doc.font("Helvetica").fontSize(fontSize + 2).text("The file below is copyrighted:", 50, y);
    y = doc.y + rowSpacing * 1.5;
    doc.fontSize(fontSize);

    // Work Title
    drawRow("Work Title", workTitle);
    // Copyright Owner
    drawRow("Copyright Owner", user.name);
    // Additional Owners (if present)
    if (additionalOwners && additionalOwners.trim() && additionalOwners !== "[]") {
      // Try to parse as JSON array, fallback to string
      let ownersStr = additionalOwners;
      try {
        const arr = JSON.parse(additionalOwners);
        if (Array.isArray(arr)) {
          ownersStr = arr.join(", ");
        }
      } catch {
        // Not JSON, use as is
      }
      drawRow("Additional Copyright Owners", ownersStr);
    }
    // Reference number
    drawRow("Reference number", displayedID);
    // Registration Date
    drawRow("Registration Date", new Date().toLocaleString());
    // Timestamping Authority
    drawRow("Timestamping Authority", "Open Timestamps");
    // Copyrighted File name
    drawRow("Copyrighted File name", originalFileName);
    // File SHA256 fingerprint
    drawRow("File SHA256 fingerprint", fingerprint);

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

import crypto from "crypto";
import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import pdfParse from "pdf-parse";
import {
  isValidPDF,
  repairPDFBuffer,
  extractTextFromPDF,
  findFingerprintInText,
  checkPDFHealth,
} from "./pdfUtils.js";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backgroundImagePath = path.join(__dirname, "../../assets/Certif.png");

const execAsync = promisify(exec);

// Simple logging helper based on environment
const log = (message, level = "info") => {
  if (process.env.NODE_ENV === "development" || level === "error") {
    console[level](message);
  }
};

// Configuration for fingerprint extraction
const FINGERPRINT_EXTRACTION_CONFIG = {
  maxRetries: 3,
  retryDelay: 100, // Base delay in ms
  enableHealthCheck: true,
  enableDetailedLogging: process.env.NODE_ENV === "development",
};

// Export configuration for external modification
export const getFingerprintExtractionConfig = () => ({
  ...FINGERPRINT_EXTRACTION_CONFIG,
});
export const updateFingerprintExtractionConfig = (updates) => {
  Object.assign(FINGERPRINT_EXTRACTION_CONFIG, updates);
  return getFingerprintExtractionConfig();
};

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
      stream.on("error", (err) =>
        reject(new Error(`Error reading file: ${err.message}`))
      );
    });
  });
};

// GENERATE DISPLAY ID FUNCTION
export const generateDisplayedID = async (userSeq, workCounter) => {
  const today = new Date();

  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0"); // months are 0-based
  const yy = String(today.getFullYear()).slice(-2);

  const datePart = `${dd}${mm}${yy}`; // DDMMYY

  const nextNumber = (workCounter + 1).toString().padStart(4, "0");

  return `${userSeq}${datePart}${nextNumber}`;
};

// FORMAT DATE FOR CERTIFICATE FUNCTION
export const formatDateForCertificate = (date = new Date()) => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");

  return `${day} ${month} ${year} at ${hour}:${minute}:${second} UTC`;
};

// GENERATE CERTIFICATE PDF FUNCTION
export const generateCertificatePDF = ({
  workTitle,
  copyrightOwner,
  user,
  additionalOwners,
  displayedID,
  fingerprint,
  originalFileName,
  originalFileUrl,
}) => {
  return new Promise((resolve, reject) => {
    const certificatesDir = path.join(process.cwd(), "certificates");
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    const outputPath = path.join(certificatesDir, `Certificate-${displayedID}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Add background image
    try {
      if (fs.existsSync(backgroundImagePath)) {
        doc.image(backgroundImagePath, 0, 0, {
          width: doc.page.width,
          height: doc.page.height,
        });
      }
    } catch (error) {
      console.error(`Error adding background image: ${error.message}`);
    }

    // Helper for key-value rows
    const rowSpacing = 18;
    const keyWidth = 175;
    let y = 200; // push below header
    const fontSize = 12;
    const leftMargin = 40; // shifted left
    const contentWidth = 480; // safe area inside page

    doc.fontSize(fontSize);

    function drawRow(key, value) {
      // Draw the key in a fixed-width column
      doc
        .font("Helvetica-Bold")
        .text(key + ":", leftMargin, y, {
          width: keyWidth,
          continued: false,
          align: "left",
        });

      // Draw the value aligned next to the key column
      doc
        .font("Helvetica")
        .text(value, leftMargin + keyWidth + 10, y, {
          width: contentWidth - keyWidth,
          align: "left",
        });

      y = doc.y + rowSpacing;
    }

    function drawLinkRow(key, text, url) {
      // Key
      doc
        .font("Helvetica-Bold")
        .text(key + ":", leftMargin, y, {
          width: keyWidth,
          continued: false,
          align: "left",
        });

      // Value as link
      doc
        .font("Helvetica")
        .fillColor("black")
        .text(text, leftMargin + keyWidth + 10, y, {
          width: contentWidth - keyWidth,
          align: "left",
          link: url,
        });

      doc.fillColor("black");
      y = doc.y + rowSpacing;
    }


    // Title inside certificate
    doc
      .font("Helvetica")
      .fontSize(fontSize + 2)
      .text("The file below is copyrighted:", leftMargin, y);
    y = doc.y + rowSpacing * 1.5;

    // Content rows
    drawRow("Work Title", workTitle);
    drawRow("Copyright Owner", copyrightOwner || user.name);

    if (
      additionalOwners &&
      additionalOwners.trim() &&
      additionalOwners !== "[]"
    ) {
      let ownersStr = additionalOwners;
      try {
        const arr = JSON.parse(additionalOwners);
        if (Array.isArray(arr)) ownersStr = arr.join(", ");
      } catch { }
      drawRow("Additional Copyright Owners", ownersStr);
      // Extra spacing after this row
      y += rowSpacing;  // 👈 adds one blank line
    }

    drawRow("Reference number", displayedID);
    drawRow("Registration Date", formatDateForCertificate());
    drawRow("Timestamping Authority", "Open Timestamps");

    // if (originalFileUrl) {
    //   drawLinkRow("Copyrighted File name", originalFileName, originalFileUrl);
    // } else {
    //   drawRow("Copyrighted File name", originalFileName);
    // }
    drawRow("Copyrighted File name", originalFileName);

    // // SHA fingerprint with wrapping
    // doc
    //   .font("Helvetica-Bold")
    //   .text("File SHA256 fingerprint: ", leftMargin, y, { continued: true });
    // doc.font("Helvetica").text(fingerprint, doc.x, y, {
    //   width: contentWidth,
    //   align: "left",
    // });

    // SHA fingerprint on its own full-width line
    doc
      .font("Helvetica-Bold")
      .text("File SHA256 fingerprint:", leftMargin, y);

    y = doc.y + 8; // vertical gap

    doc
      .font("Helvetica")
      .text(fingerprint, leftMargin, y, {
        width: doc.page.width - leftMargin * 2, // use full page width
        align: "right",
      });

    y = doc.y + rowSpacing;


    doc.end();
    stream.on("finish", () => resolve(outputPath));
    stream.on("error", reject);
  });
};

// SEND TO TSA FUNCTION
export const sendToTSA = async (certificatePath) => {
  const otsPath = `${certificatePath}.ots`;
  try {
    // Use the Windows .cmd wrapper for the CLI
    const { stdout, stderr } = await execAsync(
      `ots-cli.js.cmd stamp "${certificatePath}"`
    );
    return {
      otsFilePath: otsPath,
      stdout,
      stderr,
      blockInfo: "Pending (can be updated after verification)",
    };
  } catch (error) {
    console.error("TSA Error:", error);
    throw new Error("Error executing OpenTimestamps CLI");
  }
};

// Extract SHA256 fingerprint from certificate PDF with robust fallback strategies
export const extractFingerprintFromPDF = async (
  pdfPath,
  maxRetries = FINGERPRINT_EXTRACTION_CONFIG.maxRetries
) => {
  const retryWithBackoff = async (operation, attempt = 1) => {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      // Exponential backoff: wait 2^attempt * baseDelay ms
      const delay =
        Math.pow(2, attempt) * FINGERPRINT_EXTRACTION_CONFIG.retryDelay;
      if (FINGERPRINT_EXTRACTION_CONFIG.enableDetailedLogging) {
        log(`PDF parsing attempt ${attempt} failed, retrying in ${delay}ms...`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));

      return retryWithBackoff(operation, attempt + 1);
    }
  };

  // Strategy 1: Primary pdf-parse method
  const extractWithPdfParse = async () => {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);

      // Use the utility function for pattern matching
      const fingerprint = findFingerprintInText(data.text);
      if (fingerprint) {
        return fingerprint;
      }

      throw new Error("SHA256 fingerprint not found in PDF text.");
    } catch (error) {
      log(`pdf-parse strategy failed: ${error.message}`);
      throw error;
    }
  };

  // Strategy 2: Try reading as text file (some PDFs can be read as text)
  const extractAsTextFile = async () => {
    try {
      const content = fs.readFileSync(pdfPath, "utf8");

      // Use the utility function for pattern matching
      const fingerprint = findFingerprintInText(content);
      if (fingerprint) {
        return fingerprint;
      }

      throw new Error("Fingerprint not found in text content.");
    } catch (error) {
      log(`Text file strategy failed: ${error.message}`);
      throw error;
    }
  };

  // Strategy 3: Try with different pdf-parse options
  const extractWithPdfParseOptions = async () => {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);

      // Try different parsing options
      const options = [
        {}, // Default options
        { max: 0 }, // No page limit
        { normalizeWhitespace: true }, // Normalize whitespace
        { disableCombineTextItems: false }, // Try to combine text items
      ];

      for (const option of options) {
        try {
          const data = await pdfParse(dataBuffer, option);
          const fingerprint = findFingerprintInText(data.text);
          if (fingerprint) {
            log(
              `Found fingerprint using pdf-parse with options: ${JSON.stringify(
                option
              )}`
            );
            return fingerprint;
          }
        } catch (parseError) {
          log(
            `pdf-parse with options failed: ${JSON.stringify(option)} - ${parseError.message
            }`
          );
          continue;
        }
      }

      throw new Error("All pdf-parse options failed.");
    } catch (error) {
      log(`pdf-parse options strategy failed: ${error.message}`);
      throw error;
    }
  };

  // Strategy 4: Try to repair and re-parse
  const extractWithRepair = async () => {
    try {
      // Sometimes reading the file multiple times helps
      const dataBuffer = fs.readFileSync(pdfPath);

      // Try to clean the buffer by removing potential corruption
      const cleanBuffer = repairPDFBuffer(pdfPath);

      // Try parsing with the cleaned buffer
      const data = await pdfParse(cleanBuffer);
      const fingerprint = findFingerprintInText(data.text);

      if (fingerprint) {
        log(`Found fingerprint after buffer repair attempt`);
        return fingerprint;
      }

      throw new Error("Repair strategy failed.");
    } catch (error) {
      log(`Repair strategy failed: ${error.message}`);
      throw error;
    }
  };

  // Strategy 5: Use the new utility functions as a comprehensive fallback
  const extractWithUtilities = async () => {
    try {
      // First check PDF health
      const health = checkPDFHealth(pdfPath);
      log("PDF health check: " + JSON.stringify(health));

      if (!health.exists) {
        throw new Error("PDF file does not exist");
      }

      if (!health.isValidPDF) {
        log(
          "Warning: File may not be a valid PDF, but attempting extraction anyway"
        );
      }

      // Try to extract text using the utility function
      const textContent = await extractTextFromPDF(pdfPath);
      const fingerprint = findFingerprintInText(textContent);

      if (fingerprint) {
        log("Successfully extracted fingerprint using utility functions");
        return fingerprint;
      }

      throw new Error("Fingerprint not found using utility functions");
    } catch (error) {
      log(`Utility functions strategy failed: ${error.message}`);
      throw error;
    }
  };

  // Main execution with all strategies
  try {
    // Ensure the file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at path: ${pdfPath}`);
    }

    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);

    // Match 'File SHA256 fingerprint' line, allowing for flexible spacing
    const match = data.text.match(
      /File\s+SHA256\s+fingerprint\s*:\s*([a-fA-F0-9]{64})/
    );

    if (match && match[1]) {
      return match[1];
    } else {
      throw new Error("SHA256 fingerprint not found in PDF text.");
    }
  } catch (error) {
    console.error(
      `Failed to extract fingerprint after all strategies: ${error.message}`
    );
    throw new Error(
      `Unable to extract fingerprint from certificate PDF: ${error.message}`
    );
  }
};

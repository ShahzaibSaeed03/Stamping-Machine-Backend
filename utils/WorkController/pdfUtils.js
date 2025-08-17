import fs from "fs";
import path from "path";

/**
 * Utility functions for PDF operations and validation
 */

/**
 * Validates if a file is a valid PDF by checking its header
 * @param {string} filePath - Path to the file to validate
 * @returns {boolean} - True if file appears to be a valid PDF
 */
export const isValidPDF = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const buffer = fs.readFileSync(filePath, { start: 0, end: 8 });
    const header = buffer.toString("ascii");

    // Check for PDF header signature
    return header.startsWith("%PDF-");
  } catch (error) {
    console.log(`Error validating PDF: ${error.message}`);
    return false;
  }
};

/**
 * Attempts to repair a potentially corrupted PDF by recreating the buffer
 * @param {string} filePath - Path to the PDF file
 * @returns {Buffer} - Cleaned buffer
 */
export const repairPDFBuffer = (filePath) => {
  try {
    const originalBuffer = fs.readFileSync(filePath);

    // Create a new buffer to avoid reference issues
    const cleanBuffer = Buffer.from(originalBuffer);

    // Validate the buffer has minimum PDF content
    if (cleanBuffer.length < 100) {
      throw new Error("PDF file too small to be valid");
    }

    return cleanBuffer;
  } catch (error) {
    console.log(`Error repairing PDF buffer: ${error.message}`);
    throw error;
  }
};

/**
 * Extracts text content from PDF using multiple methods
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text content
 */
export const extractTextFromPDF = async (filePath) => {
  try {
    // Method 1: Try reading as text file first (works for some PDFs)
    try {
      const textContent = fs.readFileSync(filePath, "utf8");
      if (textContent.length > 0 && textContent.includes("SHA256")) {
        console.log("Successfully extracted text using file read method");
        return textContent;
      }
    } catch (textError) {
      // Not a text file, continue to other methods
    }

    // Method 2: Use pdf-parse with different options
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = fs.readFileSync(filePath);

    const options = [
      {},
      { max: 0, normalizeWhitespace: true },
      { disableCombineTextItems: false },
    ];

    for (const option of options) {
      try {
        const data = await pdfParse(buffer, option);
        if (data.text && data.text.length > 0) {
          console.log(
            "Successfully extracted text using pdf-parse with options:",
            option
          );
          return data.text;
        }
      } catch (parseError) {
        console.log(
          `pdf-parse with options failed:`,
          option,
          parseError.message
        );
        continue;
      }
    }

    throw new Error("All text extraction methods failed");
  } catch (error) {
    console.log(`Text extraction failed: ${error.message}`);
    throw error;
  }
};

/**
 * Finds SHA256 fingerprint in text content using multiple patterns
 * @param {string} textContent - Text content to search in
 * @returns {string|null} - Found fingerprint or null
 */
export const findFingerprintInText = (textContent) => {
  const patterns = [
    /File\s+SHA256\s+fingerprint\s*:\s*([a-fA-F0-9]{64})/,
    /SHA256\s+fingerprint\s*:\s*([a-fA-F0-9]{64})/i,
    /fingerprint\s*:\s*([a-fA-F0-9]{64})/i,
    /SHA256\s*:\s*([a-fA-F0-9]{64})/i,
    /([a-fA-F0-9]{64})/, // Last resort: find any 64-char hex string
  ];

  for (const pattern of patterns) {
    const match = textContent.match(pattern);
    if (match && match[1]) {
      console.log(`Found fingerprint using pattern: ${pattern}`);
      return match[1];
    }
  }

  return null;
};

/**
 * Comprehensive PDF health check
 * @param {string} filePath - Path to the PDF file
 * @returns {Object} - Health check results
 */
export const checkPDFHealth = (filePath) => {
  const results = {
    exists: false,
    isValidPDF: false,
    fileSize: 0,
    readable: false,
    hasContent: false,
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return results;
    }
    results.exists = true;

    // Check file size
    const stats = fs.statSync(filePath);
    results.fileSize = stats.size;

    // Check if it's a valid PDF
    results.isValidPDF = isValidPDF(filePath);

    // Check if file is readable
    try {
      const buffer = fs.readFileSync(filePath);
      results.readable = true;
      results.hasContent = buffer.length > 0;
    } catch (readError) {
      results.readable = false;
    }
  } catch (error) {
    console.log(`Error checking PDF health: ${error.message}`);
  }

  return results;
};

// otsUtil.js
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build absolute paths dynamically
const pythonScript = path.join(__dirname, "../../ots-env/bin/python");
const scriptPath = path.join(__dirname, "../../py_scripts/ots_handler.py");

export const stampWithOTS = async (filePath, displayedID) => {
  try {
    const { stdout } = await execAsync(
      `${pythonScript} ${scriptPath} stamp "${filePath}"`
    );
    const result = JSON.parse(stdout.trim());
    if (result.error) {
      throw new Error(result.error);
    }

    // Rename the OTS file to have "Timestamp-" prefix with displayedID
    const originalOtsPath = result.otsFilePath;
    const dir = path.dirname(originalOtsPath);
    const newOtsPath = path.join(dir, `Timestamp-${displayedID}.ots`);

    // Rename the file
    fs.renameSync(originalOtsPath, newOtsPath);

    return newOtsPath;
  } catch (err) {
    console.error("Stamping Error:", err.stderr || err.message);
    throw new Error("Failed to create .ots file.");
  }
};

export const verifyOTS = async (certificatePath, otsPath) => {
  try {
    const { stdout } = await execAsync(
      `${pythonScript} ${scriptPath} verify "${certificatePath}" "${otsPath}"`
    );
    const result = JSON.parse(stdout);
    // Return the result directly without additional wrapping
    return result;
  } catch (err) {
    console.error(
      "Verification Error:",
      err.stderr || err.stdout || err.message
    );
    return {
      status: "error",
      message: "Failed to verify .ots file",
      details: null,
      error: err.stderr || err.message,
    };
  }
};

// Fetch Bitcoin block data by height using mempool.space APIs
// Returns the full block JSON (including `timestamp` in seconds)
export const getBlockByHeight = async (height) => {
  try {
    const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`);
    if (!hashRes.ok) {
      throw new Error(`Failed to fetch block hash for height ${height}`);
    }
    const hash = (await hashRes.text()).trim();
    const blockRes = await fetch(`https://mempool.space/api/block/${hash}`);
    if (!blockRes.ok) {
      throw new Error(`Failed to fetch block for hash ${hash}`);
    }
    return await blockRes.json();
  } catch (error) {
    console.error("getBlockByHeight error:", error?.message || error);
    return null;
  }
};

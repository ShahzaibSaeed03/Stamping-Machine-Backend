import fs from "fs";
import path from "path";
import OpenTimestamps from "opentimestamps";
import { fileURLToPath } from "url";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create OTS timestamp for a file
 * filePath → local file saved by multer
 * displayedID → your DB/public id used in filename
 */
export const stampWithOTS = async (filePath, displayedID) => {
  try {
    // read file
    const data = fs.readFileSync(filePath);

    // create detached timestamp object
    const detached = OpenTimestamps.DetachedTimestampFile.fromBytes(
      new OpenTimestamps.Ops.OpSHA256(),
      data
    );

    // send to calendar servers
    await OpenTimestamps.stamp(detached);

    // build output path
    const dir = path.dirname(filePath);
    const otsPath = path.join(dir, `Timestamp-${displayedID}.ots`);

    // save ots file
    fs.writeFileSync(otsPath, detached.serializeToBytes());

    return otsPath;
  } catch (err) {
    console.error("OTS stamp error:", err);
    throw new Error("Failed to create .ots file");
  }
};

/**
 * Verify OTS proof against file
 * NOTE: first verification is usually pending until Bitcoin confirmation
 */
export const verifyOTS = async (filePath, otsPath) => {
  try {
    const otsBytes = fs.readFileSync(otsPath);

    const detached =
      OpenTimestamps.DetachedTimestampFile.deserialize(otsBytes);

    // upgrade proof
    await OpenTimestamps.upgrade(detached);

    const hasBitcoin =
      detached.timestamp &&
      detached.timestamp.attestations &&
      detached.timestamp.attestations.length > 0;

    if (!hasBitcoin) {
      return {
        status: "pending",
        message:
          "Timestamp submitted to calendars. Waiting for Bitcoin confirmation.",
      };
    }

    return {
      status: "verified",
      message: "Timestamp anchored in Bitcoin blockchain.",
      attestations: detached.timestamp.attestations,
    };
  } catch (err) {
    console.error("Verification error:", err);

    return {
      status: "error",
      message: "Invalid or corrupted .ots file.",
      error: err.message,
    };
  }
};
/**
 * Fetch Bitcoin block info by height
 * Used when proof becomes confirmed
 */
export const getBlockByHeight = async (height) => {
  try {
    const hashRes = await fetch(
      `https://mempool.space/api/block-height/${height}`
    );
    if (!hashRes.ok) {
      throw new Error(`Failed to fetch block hash for height ${height}`);
    }

    const hash = (await hashRes.text()).trim();

    const blockRes = await fetch(
      `https://mempool.space/api/block/${hash}`
    );
    if (!blockRes.ok) {
      throw new Error(`Failed to fetch block for hash ${hash}`);
    }

    return await blockRes.json();
  } catch (error) {
    console.error("getBlockByHeight error:", error?.message || error);
    return null;
  }
};
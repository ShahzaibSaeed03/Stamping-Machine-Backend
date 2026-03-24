import fs from "fs";
import path from "path";
import OpenTimestamps from "javascript-opentimestamps";

/**
 * CREATE TIMESTAMP (STAMP)
 */
export const stampWithOTS = async (filePath, displayedID) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    // ✅ Access via default import
    const detached = OpenTimestamps.DetachedTimestampFile.fromBytes(
      new OpenTimestamps.Ops.OpSHA256(),
      fileBuffer
    );

    await OpenTimestamps.stamp(detached);

    const dir = path.dirname(filePath);
    const otsPath = path.join(dir, `Timestamp-${displayedID}.ots`);

    fs.writeFileSync(otsPath, Buffer.from(detached.serializeToBytes()));

    return otsPath;

  } catch (err) {
    console.error("OTS JS stamp error:", err);
    throw new Error("Failed to create timestamp");
  }
};


/**
 * VERIFY TIMESTAMP
 */
export const verifyOTS = async (filePath, otsPath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const otsBuffer = fs.readFileSync(otsPath);

    // Load OTS proof
    const detached = OpenTimestamps.DetachedTimestampFile.deserialize(
      new Uint8Array(otsBuffer)
    );

    // Recreate from original file (IMPORTANT)
    const detachedOriginal = OpenTimestamps.DetachedTimestampFile.fromBytes(
      new OpenTimestamps.Ops.OpSHA256(),
      fileBuffer
    );

    // Compare message (digest check)
    if (
      detachedOriginal.fileDigest().toString() !==
      detached.fileDigest().toString()
    ) {
      return {
        status: "error",
        message: "File does not match timestamp"
      };
    }

    // Try upgrade (fetch confirmations)
    await OpenTimestamps.upgrade(detached);

    return {
      status: detached.timestamp.isTimestampComplete()
        ? "verified"
        : "pending",
      message: detached.timestamp.isTimestampComplete()
        ? "Timestamp verified on Bitcoin blockchain"
        : "Timestamp submitted but not yet confirmed",
      verified: detached.timestamp.isTimestampComplete()
    };

  } catch (err) {
    console.error("OTS JS verify error:", err);

    return {
      status: "error",
      message: err.message
    };
  }
};
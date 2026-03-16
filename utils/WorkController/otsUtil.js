import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const otsCommand =
  process.platform === "win32" ? "ots-cli.js.cmd" : "ots-cli";

export const stampWithOTS = async (certificatePath, displayedID) => {
  try {

    // create timestamp
    await execAsync(`${otsCommand} stamp "${certificatePath}"`);

    const defaultOTS = `${certificatePath}.ots`;

    const dir = path.dirname(certificatePath);
    const customOTS = path.join(dir, `Timestamp-${displayedID}.ots`);

    fs.renameSync(defaultOTS, customOTS);

    return customOTS;

  } catch (err) {
    console.error("OTS stamp error:", err);
    throw new Error("Failed to create timestamp");
  }
};


export const verifyOTS = async (certificatePath, otsPath) => {
  try {

    const cmd = `${otsCommand} verify "${otsPath}" -f "${certificatePath}"`;

    const { stdout } = await execAsync(cmd);

    let blockMatch = stdout.match(/Bitcoin block (\d+)/);
    let block = blockMatch ? blockMatch[1] : null;

    if (block) {
      return {
        status: "verified",
        message: "Timestamp verified on Bitcoin blockchain",
        bitcoinBlock: block,
        attestedAt: new Date().toISOString().split("T")[0] + " PKT"
      };
    }

    return {
      status: "pending",
      message: "Timestamp exists but not yet confirmed on Bitcoin."
    };

  } catch (err) {

    return {
      status: "error",
      message: err.message
    };

  }
};
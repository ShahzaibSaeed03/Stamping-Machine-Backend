import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const otsCommand =
  process.platform === "win32"
    ? "ots-cli.js.cmd"
    : process.env.OTS_PATH || "/usr/bin/ots-cli.js";

export const stampWithOTS = async (certificatePath, displayedID) => {
  try {

    const defaultOTS = `${certificatePath}.ots`;

    // remove existing proof if it exists
    if (fs.existsSync(defaultOTS)) {
      fs.unlinkSync(defaultOTS);
    }

    await execAsync(`${otsCommand} stamp "${certificatePath}"`);

    const dir = path.dirname(certificatePath);
    const customOTS = path.join(dir, `Timestamp-${displayedID}.ots`);

    fs.renameSync(defaultOTS, customOTS);

    return customOTS;

  } catch (err) {
    console.error("OTS stamp error:", err.stderr || err.stdout || err);
    throw new Error("Failed to create timestamp");
  }
};


export const verifyOTS = async (certificatePath, otsPath) => {
  try {

    const cmd = `${otsCommand} verify "${otsPath}" -f "${certificatePath}"`;

    const { stdout, stderr } = await execAsync(cmd);

    const output = `${stdout}\n${stderr}`;

    if (output.includes("Success! Bitcoin block")) {

      const match = output.match(/Bitcoin block (\d+)/);
      const block = match ? match[1] : null;

      return {
        status: "verified",
        message: "Timestamp verified on Bitcoin blockchain",
        bitcoinBlock: block,
        verified: true
      };
    }

    if (output.includes("Pending")) {
      return {
        status: "pending",
        message: "Timestamp submitted but not yet confirmed on Bitcoin"
      };
    }

    return {
      status: "error",
      message: output
    };

  } catch (err) {

    const output = err.stdout || err.stderr || err.message;

    if (output && output.includes("Success! Bitcoin block")) {

      const match = output.match(/Bitcoin block (\d+)/);
      const block = match ? match[1] : null;

      return {
        status: "verified",
        message: "Timestamp verified on Bitcoin blockchain",
        bitcoinBlock: block,
        verified: true
      };
    }

    return {
      status: "error",
      message: output
    };
  }
};
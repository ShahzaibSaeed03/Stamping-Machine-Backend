import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

const OTS_PATH = "/home/shahzaib/.local/bin/ots";

/* ---------------- PATH CONVERT ---------------- */
const toWSLPath = (p) => {
  const abs = path.resolve(p).replace(/\\/g, "/");
  return abs.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
};

/* ---------------- RUN OTS ---------------- */
const runOTS = async (args, options = {}) => {

  const isWindows = process.platform === "win32";

  const cmd = isWindows
    ? `wsl -d Ubuntu -- ${OTS_PATH} ${args}`   // local (Windows)
    : `${OTS_PATH} ${args}`                   // server (Linux)

  console.log("[OTS]", cmd);

  return execAsync(cmd, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout || 120000,
  });
};

/* ---------------- MOVE FILE ---------------- */
const moveWSL = async (from, to) => {
  const cmd = `wsl -d Ubuntu -- mv "${from}" "${to}"`;
  return execAsync(cmd);
};

/* ---------------- GET BLOCK TIME ---------------- */
const getBitcoinBlockTime = async (blockHeight) => {
  try {
    const res = await fetch(
      `https://blockchain.info/block-height/${blockHeight}?format=json`
    );

    const data = await res.json();
    const block = data.blocks[0];

    return new Date(block.time * 1000).toISOString();

  } catch (e) {
    console.error("Block time fetch error:", e.message);
    return null;
  }
};

/* ---------------- CHECK OTS ---------------- */
export const checkOTSAvailable = async () => {
  try {
    const { stdout } = await runOTS("--version");
    console.log("✅ OTS:", stdout.trim());
    return true;
  } catch (e) {
    console.error("❌ OTS not available:", e.message);
    return false;
  }
};

/* ---------------- STAMP ---------------- */
export const stampWithOTS = async (filePath, displayedID) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const wslFile = toWSLPath(filePath);

    const dir = path.dirname(filePath);
    const otsPath = path.join(dir, `Timestamp-${displayedID}.ots`);

    const wslTemp = `${wslFile}.ots`;
    const wslFinal = toWSLPath(otsPath);

    // stamp
    await runOTS(`stamp "${wslFile}"`);

    // move file
    await moveWSL(wslTemp, wslFinal);

    // upgrade (optional)
    try {
      await runOTS(`--no-bitcoin upgrade "${wslFinal}"`);
    } catch {}

    return otsPath;

  } catch (err) {
    console.error("STAMP ERROR:", err);
    throw err;
  }
};

/* ---------------- VERIFY ---------------- */
export const verifyOTS = async (filePath, otsPath) => {
  try {
    if (!fs.existsSync(filePath) || !fs.existsSync(otsPath)) {
      return {
        status: "error",
        message: "File or OTS not found",
      };
    }

    const wslFile = toWSLPath(filePath);
    const wslOts = toWSLPath(otsPath);

    let output = "";

    try {
      const res = await runOTS(
        `--no-bitcoin verify -f "${wslFile}" "${wslOts}"`
      );
      output = res.stdout + res.stderr;
    } catch (err) {
      output = (err.stdout || "") + (err.stderr || "");
    }

    console.log("OTS OUTPUT:", output);

    /* -------- VERIFIED -------- */
    if (/Bitcoin block/i.test(output)) {

      const match = output.match(/Bitcoin block (\d+)/i);
      const blockHeight = match ? parseInt(match[1]) : null;

      let blockTime = null;

      if (blockHeight) {
        blockTime = await getBitcoinBlockTime(blockHeight);
      }

      return {
        status: "verified",
        verified: true,
        blockHeight,
        blockTime, // 🔥 registration date
        message: "✅ Timestamp anchored in Bitcoin",
        raw: output,
      };
    }

    /* -------- PENDING -------- */
    if (/pending|not yet/i.test(output)) {
      return {
        status: "pending",
        verified: false,
        message: "⏳ Waiting for Bitcoin confirmation",
        raw: output,
      };
    }

    /* -------- PARTIAL (CACHE) -------- */
    if (/attestation/i.test(output)) {
      return {
        status: "pending",
        verified: false,
        message: "⏳ Proof exists, waiting for Bitcoin confirmation",
        raw: output,
      };
    }

    /* -------- UNKNOWN -------- */
    return {
      status: "unknown",
      message: output,
      raw: output,
    };

  } catch (err) {
    return {
      status: "error",
      message: err.message,
    };
  }
};
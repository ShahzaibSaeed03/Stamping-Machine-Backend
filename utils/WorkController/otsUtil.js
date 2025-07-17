// otsUtil.js
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import path from "path";
import { fileURLToPath } from "url";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build absolute paths dynamically
const pythonScript = path.join(__dirname, "../../ots-env/bin/python");
const scriptPath = path.join(__dirname, "../py_scripts/ots_handler.py");


export const stampWithOTS = async (filePath) => {
    try {
        const { stdout } = await execAsync(`${pythonScript} ${scriptPath} stamp "${filePath}"`);
        const result = JSON.parse(stdout.trim());
        if (result.error) {
            throw new Error(result.error);
        }
        return result.otsFilePath;
    } catch (err) {
        console.error("Stamping Error:", err.stderr || err.message);
        throw new Error("Failed to create .ots file.");
    }
};

export const verifyOTS = async (certificatePath, otsPath) => {
    try {
        const { stdout } = await execAsync(`${pythonScript} ${scriptPath} verify "${certificatePath}" "${otsPath}"`);
        const result = JSON.parse(stdout);
        
        // Return the result directly without additional wrapping
        return result;
    } catch (err) {
        console.error("Verification Error:", err.stderr || err.stdout || err.message);
        return {
            status: "error",
            message: "Failed to verify .ots file",
            details: null,
            error: err.stderr || err.message
        };
    }
};

# src/ots_handler.py
import subprocess
import sys
import os
import json
import re

# Get OTS binary path from environment or fallback to 'ots' in PATH
OTS_BIN_PATH = os.getenv('OTS_BIN_PATH', 'ots')

def stamp_file(file_path):
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    ots_path = file_path + ".ots"
    result = subprocess.run([OTS_BIN_PATH, "stamp", file_path], capture_output=True, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"Stamping failed: {result.stderr.strip()}")
    
    return {
        "otsFilePath": ots_path,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "blockInfo": "Pending verification"
    }

def verify_ots_file(file_path, ots_path):
    if not os.path.isfile(file_path) or not os.path.isfile(ots_path):
        raise FileNotFoundError("One or both files not found.")

    try:
        result = subprocess.run([OTS_BIN_PATH, "--no-bitcoin", "verify", ots_path], capture_output=True, text=True)
        full_output = result.stdout + result.stderr

        if "Got" in full_output and "attestation(s) from cache" in full_output:
            return {
                "status": "pending",
                "message": "Timestamp submitted and cached by calendar servers",
                "details": full_output.strip(),
                "error": None
            }

        if "Pending confirmation in Bitcoin blockchain" in full_output:
            return {
                "status": "pending",
                "message": "Timestamp is pending confirmation in Bitcoin blockchain",
                "details": full_output.strip(),
                "error": None
            }

        match = re.search(r"Bitcoin block (\d+) attests existence as of (.+)", full_output)
        if match:
            return {
                "status": "confirmed",
                "message": f"Timestamp confirmed in Bitcoin block {match.group(1)} on {match.group(2)}",
                "details": full_output.strip(),
                "error": None
            }

        return {
            "status": "error",
            "message": "Unexpected verification response",
            "details": full_output.strip(),
            "error": "Verification output did not match expected patterns"
        }

    except Exception as e:
        return {
            "status": "error",
            "message": "Verification failed",
            "details": None,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: ots_handler.py [stamp|verify] <file> [ots_file]"}))
        sys.exit(1)

    mode = sys.argv[1]
    file_path = sys.argv[2]

    try:
        if mode == "stamp":
            result = stamp_file(file_path)
        elif mode == "verify":
            if len(sys.argv) < 4:
                raise ValueError("Missing OTS file for verification.")
            ots_file_path = sys.argv[3]
            result = verify_ots_file(file_path, ots_file_path)
        else:
            raise ValueError("Invalid mode. Use 'stamp' or 'verify'.")
        
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
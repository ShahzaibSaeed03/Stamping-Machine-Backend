# src/tsa_handler.py
import subprocess
import sys
import os
import json
import re

# Full path to the ots binary inside your virtual environment
OTS_BIN_PATH = "/home/ar/Work/Projects/ShahzaidSaeed/StampingProject/ots-env/bin/ots"

# ✅ Function to create (stamp) an OTS file
def stamp_file(file_path):
    ots_path = file_path + ".ots"
    result = subprocess.run([OTS_BIN_PATH, "stamp", file_path], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Stamping failed: {result.stderr}")
    return {
        "otsFilePath": ots_path,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "blockInfo": "Pending verification"
    }


# ✅ Function to verify an OTS file
def verify_ots_file(file_path, ots_path):
    try:
        # For verification, we only need the .ots file path
        result = subprocess.run([OTS_BIN_PATH, "--no-bitcoin", "verify", ots_path], capture_output=True, text=True)
        
        # Combine stdout and stderr for checking since ots sometimes writes to stderr
        full_output = result.stdout + result.stderr
        
        # Check for attestations from cache
        if "Got" in full_output and "attestation(s) from cache" in full_output:
            return {
                "status": "pending",
                "message": "Timestamp submitted and cached by calendar servers",
                "details": full_output.strip(),
                "error": None
            }
            
        # Check for calendar server pending confirmations
        if "Pending confirmation in Bitcoin blockchain" in full_output:
            return {
                "status": "pending",
                "message": "Timestamp is pending confirmation in Bitcoin blockchain",
                "details": full_output.strip(),
                "error": None
            }
            
        # Check for confirmed timestamp
        match = re.search(r"Bitcoin block (\d+) attests existence as of (.+)", full_output)
        if match:
            block_number = match.group(1)
            timestamp = match.group(2)
            return {
                "status": "confirmed",
                "message": f"Timestamp confirmed in Bitcoin block {block_number} on {timestamp}",
                "details": full_output.strip(),
                "error": None
            }
            
        # If we get here, something unexpected happened
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
            result = verify_ots_file(file_path, sys.argv[3])
        else:
            raise ValueError("Invalid mode")
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

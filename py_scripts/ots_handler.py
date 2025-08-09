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
    try:
        result = subprocess.run([OTS_BIN_PATH, "stamp", file_path], capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError(f"Stamping failed: ots binary not found at '{OTS_BIN_PATH}'. Set OTS_BIN_PATH to the full path of 'ots'.")
    
    if result.returncode != 0:
        raise RuntimeError(f"Stamping failed: {result.stderr.strip() or result.stdout.strip()}")
    
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
        full_output = (result.stdout or "") + (result.stderr or "")

        # Parse calendar attestations
        calendars = re.findall(r"Got \d+ attestation\(s\) from (https?://[^\s]+)", full_output)

        # Parse anchors hinted by calendars (when --no-bitcoin)
        anchors = []
        for m in re.finditer(r"To verify manually, check that Bitcoin block (\d+) has merkleroot ([0-9a-fA-F]{64})", full_output):
            anchors.append({
                "block": int(m.group(1)),
                "merkleroot": m.group(2).lower()
            })

        # Parse confirmed output when Bitcoin verification is enabled
        confirmed_match = re.search(r"Bitcoin block (\d+) attests existence as of (.+)", full_output)

        if confirmed_match:
            status = "verified"
            message = f"Timestamp confirmed in Bitcoin block {confirmed_match.group(1)} on {confirmed_match.group(2)}"
        elif anchors:
            status = "verified"
            message = "Anchored by calendar servers with Bitcoin block references"
        elif "Pending confirmation in Bitcoin blockchain" in full_output:
            status = "pending"
            message = "Timestamp is pending confirmation in Bitcoin blockchain"
        elif "attestation(s) from" in full_output:
            status = "pending"
            message = "Timestamp submitted and cached by calendar servers"
        else:
            status = "error"
            message = "Unexpected verification response"

        return {
            "status": status,
            "message": message,
            "details": full_output.strip(),
            "error": None if status != "error" else "Verification output did not match expected patterns",
            "calendars": calendars,
            "anchors": anchors
        }

    except FileNotFoundError:
        return {
            "status": "error",
            "message": f"Verification failed: ots binary not found at '{OTS_BIN_PATH}'. Set OTS_BIN_PATH to the full path of 'ots'.",
            "details": None,
            "error": "ots not found",
            "calendars": [],
            "anchors": []
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "Verification failed",
            "details": None,
            "error": str(e),
            "calendars": [],
            "anchors": []
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
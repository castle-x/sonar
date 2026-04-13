#!/bin/bash
# SET LOG LEVEL , default info , you can change this
export ABLOG_LEVEL=debug
CURDIR=$(cd $(dirname $0); pwd)
BinaryName=monitor_hub

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if application is already running
PID_FILE="$CURDIR/${BinaryName}.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${RED}Error: $BinaryName is already running with PID: $PID${NC}"
        echo -e "${RED}Please run terminate.sh to stop the existing process first or remove the PID file: $PID_FILE${NC}"
        exit 1
    else
        echo -e "${YELLOW}Warning: Found stale PID file. Removing it...${NC}"
        rm -f "$PID_FILE"
    fi
fi

# Create logs directory if not exists
LOGS_DIR="$CURDIR/logs"
mkdir -p "$LOGS_DIR"

# Generate log filename with current date and time
LOG_FILE="$LOGS_DIR/${BinaryName}_$(date +%Y%m%d_%H%M%S).log"

echo -e "${GREEN}Starting $BinaryName in background...${NC}"
echo -e "${GREEN}Log file: $LOG_FILE${NC}"
echo -e "${GREEN}PID file: $PID_FILE${NC}"

# Start the application in a new session using setsid
# This ensures the process is completely isolated from the current shell
setsid nohup $CURDIR/${BinaryName} --config $CURDIR/local_config.yaml > "$LOG_FILE" 2>&1 &

# Get the PID of the background process
PID=$!

# Save PID to file
echo "$PID" > "$PID_FILE"

echo -e "${GREEN}Application started with PID: $PID${NC}"
echo -e "${GREEN}Showing logs... (Press Ctrl+C to exit log viewing, the process will continue running)${NC}"
echo -e "${GREEN}---${NC}"

# Wait a moment for the log file to be created
sleep 1

# Follow the log file
tail -f -n 500 "$LOG_FILE"
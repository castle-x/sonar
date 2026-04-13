#!/bin/bash
CURDIR=$(cd $(dirname $0); pwd)
BinaryName=node_process_exporter

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# check pid file
if [ ! -f "$CURDIR/${BinaryName}.pid" ]; then
    echo "$CURDIR/${BinaryName}.pid not found"
    exit 1
fi

# terminate the binary
kill -2 $(cat $CURDIR/${BinaryName}.pid)
if [ $? != 0 ]; then
    echo "terminate $CURDIR/${BinaryName}.pid failed"
    exit 1
fi

echo -e "${GREEN}terminate $CURDIR/${BinaryName}.pid success${NC}"

echo "" > $CURDIR/${BinaryName}.pid

rm $CURDIR/${BinaryName}.pid
if [ $? != 0 ]; then
    echo "remove $CURDIR/${BinaryName}.pid failed"
    exit 1
fi

echo -e "${GREEN}remove $CURDIR/${BinaryName}.pid success${NC}"
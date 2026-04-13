#!/usr/bin/env bash

# Color constants
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored status
print_status() {
    local status=$1
    local message=$2
    local color=$3
    
    echo -e "${color}[${status}]${NC} [${message}]"
}

# Get current script directory
CURDIR=$(cd $(dirname $0); pwd)
WorkDir=$CURDIR/bin
BinaryName=node_process_exporter
cd $CURDIR

# default v1
if [ -z "$ConfigVersion" ]; then
    ConfigVersion=v1
fi

ConfigYamlTmplPath=$CURDIR/config/config.yaml.tmpl
if [ ! -f "$ConfigYamlTmplPath" ]; then
    print_status "FAILED" "config.yaml.tmpl not found" $RED
    exit 1
fi

mkdir -p $WorkDir

go mod tidy
if [ $? != 0 ]; then
  print_status "FAILED" "go mod tidy" $RED
  exit 1
fi
print_status "SUCCESS" "go mod tidy" $GREEN

# Check OS
OS=$(uname)
if [ "$OS" == "Darwin" ]; then
    OUTPUT="$WorkDir/$BinaryName"
elif [ "$OS" == "Linux" ]; then
    OUTPUT="$WorkDir/$BinaryName"
else
    OUTPUT="$WorkDir/$BinaryName.exe"
fi

# Build
print_status "RUNNING" "Building $BinaryName for $OS platform ..." $BLUE
CGO_ENABLED=0 go build -ldflags="-s -w" -o $OUTPUT $CURDIR/cmd/$BinaryName/main.go
if [ $? != 0 ]; then
  print_status "FAILED" "build $BinaryName" $RED
  exit 1
fi

# Output success message and file path
print_status "SUCCESS" "go build $BinaryName for $OS platform" $GREEN
print_status "SUCCESS" "created binary at $OUTPUT" $GREEN

# copy script/* to $WorkDir
cp -r $CURDIR/script/* $WorkDir
print_status "SUCCESS" "copy script/* to $WorkDir" $GREEN

# copy config.yaml.tmpl to $WorkDir
cp $ConfigYamlTmplPath $WorkDir/config.yaml.tmpl
print_status "SUCCESS" "copy config.yaml.tmpl to $WorkDir" $GREEN

# config.yaml.tmp to config.yaml
cp $WorkDir/config.yaml.tmpl $WorkDir/config.yaml
print_status "SUCCESS" "copy config.yaml.tmpl to config.yaml" $GREEN
#!/bin/bash

# Exit on error
set -e

# Build the backend
go build

# Build the React app
cd ui
# npm ci # Re enable for clean prod builds
npm run build
cd ..


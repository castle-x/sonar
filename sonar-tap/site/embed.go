package site

import (
	"embed"
	"io/fs"
)

// distDir embeds all files from the dist directory.
// The `all:` prefix includes hidden files (starting with . or _).
//
//go:embed all:dist
var distDir embed.FS

// DistDirFS is the public filesystem interface for embedded files.
// fs.Sub removes the "dist/" prefix, so files are accessed directly:
//   - "index.html" instead of "dist/index.html"
//   - "assets/index-abc123.js" instead of "dist/assets/index-abc123.js"
var DistDirFS, _ = fs.Sub(distDir, "dist")

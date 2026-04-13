package site

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distDir embed.FS

// DistDirFS 返回嵌入的前端资源文件系统
// 使用时：siteserver.StaticFS(h, site.DistDirFS)
var DistDirFS, _ = fs.Sub(distDir, "dist")

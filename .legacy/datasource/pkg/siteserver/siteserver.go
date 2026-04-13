package siteserver

import (
	"context"
	"io/fs"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
)

// hertzResponseWriter 适配器，将 Hertz 的 RequestContext 适配为标准的 http.ResponseWriter
type hertzResponseWriter struct {
	c           *app.RequestContext
	ctx         context.Context
	header      http.Header
	wroteHeader bool
	statusCode  int
}

func newHertzResponseWriter(c *app.RequestContext, ctx context.Context) *hertzResponseWriter {
	return &hertzResponseWriter{
		c:          c,
		ctx:        ctx,
		header:     make(http.Header),
		statusCode: http.StatusOK,
	}
}

func (w *hertzResponseWriter) Header() http.Header {
	return w.header
}

func (w *hertzResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.c.Response.BodyWriter().Write(b)
}

func (w *hertzResponseWriter) WriteHeader(statusCode int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.statusCode = statusCode

	// 将 http.Header 同步到 Hertz Response
	for key, values := range w.header {
		for _, value := range values {
			w.c.Response.Header.Add(key, value)
		}
	}

	w.c.Response.SetStatusCode(statusCode)
}

// StaticFS 提供静态文件服务（用于嵌入的前端资源）
// 这是一个 Hertz 框架的静态文件服务中间件
//
// 使用方法：
//
//	import "datasource/site"
//	siteserver.StaticFS(h, site.DistDirFS)
func StaticFS(h *server.Hertz, embedFS fs.FS) error {
	// 读取 index.html 用于 SPA 路由降级
	indexHTML, err := fs.ReadFile(embedFS, "index.html")
	if err != nil {
		return err
	}

	// 静态资源处理函数
	fileServer := http.FileServer(http.FS(embedFS))

	// 注册 NoRoute 处理器（所有未匹配的路由都会到这里）
	h.NoRoute(func(ctx context.Context, c *app.RequestContext) {
		reqPath := string(c.Request.RequestURI())
		reqPath = strings.TrimPrefix(reqPath, "/")

		// 静态资源文件（包含扩展名）
		if strings.Contains(path.Base(reqPath), ".") {
			// 设置缓存头（对 assets 目录下的文件设置长期缓存）
			if strings.HasPrefix(reqPath, "assets/") {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
			}

			// 尝试打开文件
			if _, err := embedFS.Open(reqPath); err == nil {
				// 文件存在，使用 fileServer 提供服务
				// 构造标准的 http.Request
				uri := c.Request.URI()
				httpReq := &http.Request{
					Method: string(c.Request.Method()),
				}
				httpReq.URL = &url.URL{
					Scheme: string(uri.Scheme()),
					Host:   string(uri.Host()),
					Path:   "/" + reqPath,
				}

				// 使用新的 Hertz 响应包装器
				w := newHertzResponseWriter(c, ctx)
				fileServer.ServeHTTP(w, httpReq)
				return
			}
		}

		// 不是静态文件或文件不存在，返回 index.html（SPA 路由）
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Cache-Control", "no-cache")
		c.SetStatusCode(http.StatusOK)
		c.Write(indexHTML)
	})

	return nil
}

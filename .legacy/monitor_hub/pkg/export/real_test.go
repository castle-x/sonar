//go:build manual
// +build manual

package export

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

// 手动测试：导出真实报告页面（带完整预设操作）
// 运行: GOTOOLCHAIN=local go test -v ./pkg/export/... -run TestRealReport -tags manual -timeout 5m
func TestRealReport(t *testing.T) {
	outputDir := "./tmp/real_report"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:        true,
		WindowWidth:     1920,
		WindowHeight:    1080,
		Timeout:         180,                             // 3分钟超时
		WaitSelector:    `[data-export-complete="true"]`, // 等待渲染完成标识
		WaitTimeout:     120,                             // 给足时间等待渲染
		ExtraWaitTime:   2,
		OutputDir:       outputDir,
		PrintBackground: true,
		PaperWidth:      11.69, // A4 横向
		PaperHeight:     8.27,
		ImageScale:      2.0,
	})

	onProgress := func(progress int32, message string) {
		fmt.Printf("[%d%%] %s\n", progress, message)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 使用专用导出页面 URL
	pageURL := "http://9.135.120.94:5173/report/693184403bcb8cf00b4e5be9/export"

	// 导出 PNG（使用专用导出页面）
	t.Log("========== 导出 PNG（使用专用导出页面）==========")
	result, err := exporter.ExportReportPNG(ctx, pageURL, "693184403bcb8cf00b4e5be9", "报告导出测试", onProgress)
	if err != nil {
		t.Fatalf("PNG 导出失败: %v", err)
	}
	t.Logf("✅ PNG 导出成功: %s (大小: %.2f MB)", result.FilePath, float64(result.FileSize)/1024/1024)
}

// 简单导出测试（使用专用导出页面，无额外操作）
func TestRealReportSimple_Skip(t *testing.T) {
	t.Skip("跳过简单测试，使用 TestRealReport 即可")
	outputDir := "./tmp/real_report_simple"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:        true,
		WindowWidth:     1920,
		WindowHeight:    1080,
		Timeout:         120,
		WaitSelector:    `[data-export-complete="true"]`, // 等待渲染完成标识
		WaitTimeout:     60,
		ExtraWaitTime:   2,
		OutputDir:       outputDir,
		PrintBackground: true,
		PaperWidth:      11.69,
		PaperHeight:     8.27,
		ImageScale:      2.0,
	})

	onProgress := func(progress int32, message string) {
		fmt.Printf("[%d%%] %s\n", progress, message)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// 使用专用导出页面的简单导出（无额外 PreActions）
	t.Log("========== 简单导出 PNG（使用专用导出页面）==========")
	result, err := exporter.Export(ctx, &ExportRequest{
		ReportID:   "693184403bcb8cf00b4e5be9",
		ReportName: "简单导出测试",
		Format:     FormatPNG,
		PageURL:    "http://9.135.120.94:5173/report/693184403bcb8cf00b4e5be9/export",
		// 使用简化的预设操作（导出页面已默认展开）
		PreActions: SimpleReportExportActions(),
	}, onProgress)

	if err != nil {
		t.Fatalf("PNG 导出失败: %v", err)
	}
	t.Logf("✅ PNG 导出成功: %s (大小: %.2f MB)", result.FilePath, float64(result.FileSize)/1024/1024)
}

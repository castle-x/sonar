package export

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// ============================================
// 测试用的简单 HTML 页面
// ============================================

const testHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Export Test Page</title>
    <style>
        body { font-family: "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; padding: 20px; }
        .header { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
        .content { padding: 20px; background: #f5f5f5; border-radius: 8px; }
        .chart { width: 400px; height: 200px; background: linear-gradient(to right, #4CAF50, #2196F3); margin: 20px 0; }
        [data-export-ready="true"] { border: 2px solid green; }
    </style>
</head>
<body>
    <div data-export-ready="true">
        <div class="header">测试报告</div>
        <div class="content">
            <p>这是一个测试页面，用于验证 chromedp 导出功能。</p>
            <div class="chart"></div>
            <ul>
                <li>测试项目 1</li>
                <li>测试项目 2</li>
                <li>测试项目 3</li>
            </ul>
        </div>
    </div>
</body>
</html>`

// 带延迟加载的测试页面
const testHTMLWithDelay = `<!DOCTYPE html>
<html>
<head>
    <title>Delayed Content Test</title>
    <style>
        body { font-family: "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif; padding: 20px; }
        .loading { color: gray; }
        .loaded { color: green; font-weight: bold; }
    </style>
</head>
<body>
    <div id="container">
        <p class="loading">Loading...</p>
    </div>
    <script>
        // 模拟延迟加载
        setTimeout(function() {
            document.getElementById('container').innerHTML = 
                '<div data-export-ready="true"><p class="loaded">内容已加载！</p></div>';
        }, 1000);
    </script>
</body>
</html>`

// ============================================
// 基础功能测试
// ============================================

// TestExporterCreation 测试创建导出器
func TestExporterCreation(t *testing.T) {
	// 使用默认配置创建
	exporter := NewExporter(nil)
	if exporter == nil {
		t.Fatal("NewExporter returned nil")
	}
	if exporter.config == nil {
		t.Fatal("Exporter config is nil")
	}

	// 验证默认配置
	cfg := exporter.config
	if !cfg.Headless {
		t.Error("Default headless should be true")
	}
	if cfg.WindowWidth != 1920 {
		t.Errorf("Default window width should be 1920, got %d", cfg.WindowWidth)
	}
	if cfg.WindowHeight != 1080 {
		t.Errorf("Default window height should be 1080, got %d", cfg.WindowHeight)
	}
}

// TestExporterWithCustomConfig 测试自定义配置
func TestExporterWithCustomConfig(t *testing.T) {
	cfg := &ExportConfig{
		Headless:        true,
		WindowWidth:     1280,
		WindowHeight:    720,
		Timeout:         60,
		OutputDir:       "./test_exports",
		ImageScale:      1.5,
		ImageQuality:    85,
		PrintBackground: true,
	}

	exporter := NewExporter(cfg)
	if exporter.config.WindowWidth != 1280 {
		t.Errorf("Custom window width not applied, got %d", exporter.config.WindowWidth)
	}
}

// ============================================
// 导出功能测试（需要 Chrome）
// ============================================

// TestExportPDF 测试 PDF 导出
func TestExportPDF(t *testing.T) {
	// 跳过条件：如果没有 Chrome
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	// 创建测试服务器
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(testHTML))
	}))
	defer server.Close()

	// 创建输出目录（保存到项目 tmp 目录，便于查看）
	outputDir := "./tmp/export_test_pdf"
	os.MkdirAll(outputDir, 0755)

	// 创建导出器
	exporter := NewExporter(&ExportConfig{
		Headless:        true,
		WindowWidth:     1280,
		WindowHeight:    720,
		Timeout:         60,
		WaitSelector:    `[data-export-ready="true"]`,
		WaitTimeout:     10,
		ExtraWaitTime:   1,
		OutputDir:       outputDir,
		PrintBackground: true,
		PaperWidth:      8.27,
		PaperHeight:     11.69,
	})

	// 进度回调
	var progressUpdates []string
	onProgress := func(progress int32, message string) {
		progressUpdates = append(progressUpdates, fmt.Sprintf("%d%%: %s", progress, message))
		t.Logf("Progress: %d%% - %s", progress, message)
	}

	// 执行导出
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := exporter.Export(ctx, &ExportRequest{
		ReportID:   "test-report-001",
		ReportName: "测试报告",
		Format:     FormatPDF,
		PageURL:    server.URL,
	}, onProgress)

	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	// 验证结果
	if result == nil {
		t.Fatal("Export result is nil")
	}
	if result.TaskID == "" {
		t.Error("TaskID is empty")
	}
	if result.FilePath == "" {
		t.Error("FilePath is empty")
	}
	if result.FileSize == 0 {
		t.Error("FileSize is 0")
	}

	// 验证文件存在
	if _, err := os.Stat(result.FilePath); os.IsNotExist(err) {
		t.Errorf("Output file does not exist: %s", result.FilePath)
	}

	// 验证进度更新
	if len(progressUpdates) == 0 {
		t.Error("No progress updates received")
	}

	t.Logf("PDF exported successfully: %s (size: %d bytes)", result.FilePath, result.FileSize)
}

// TestExportPNG 测试 PNG 导出
func TestExportPNG(t *testing.T) {
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	// 创建测试服务器
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(testHTML))
	}))
	defer server.Close()

	// 创建输出目录（保存到项目 tmp 目录，便于查看）
	outputDir := "./tmp/export_test_png"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:      true,
		WindowWidth:   1280,
		WindowHeight:  720,
		Timeout:       60,
		WaitSelector:  `[data-export-ready="true"]`,
		WaitTimeout:   10,
		ExtraWaitTime: 1,
		OutputDir:     outputDir,
		ImageScale:    2.0,
		ImageQuality:  90,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := exporter.Export(ctx, &ExportRequest{
		ReportID:   "test-report-002",
		ReportName: "测试报告PNG",
		Format:     FormatPNG,
		PageURL:    server.URL,
	}, nil)

	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	if result.FileSize == 0 {
		t.Error("FileSize is 0")
	}

	// 验证是有效的图片文件 (PNG 或 JPEG)
	data, _ := os.ReadFile(result.FilePath)
	isPNG := len(data) >= 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n"
	isJPEG := len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF

	if !isPNG && !isJPEG {
		t.Errorf("Output is not a valid image file (first 8 bytes: %x)", data[:min(8, len(data))])
	}

	format := "PNG"
	if isJPEG {
		format = "JPEG"
	}
	t.Logf("Image exported successfully as %s: %s (size: %d bytes)", format, result.FilePath, result.FileSize)
}

// ============================================
// 导出前操作测试
// ============================================

// TestExportWithPreActions 测试带预操作的导出
func TestExportWithPreActions(t *testing.T) {
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	// 带按钮的测试页面
	testHTMLWithButton := `<!DOCTYPE html>
<html>
<head><title>Pre-Action Test</title></head>
<body>
    <div id="content" style="display:none" data-export-ready="true">
        <h1>展开的内容</h1>
        <p>这段内容在点击按钮后显示</p>
    </div>
    <button id="expand-btn" data-export-action="expand" onclick="document.getElementById('content').style.display='block'; this.style.display='none';">
        展开
    </button>
</body>
</html>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(testHTMLWithButton))
	}))
	defer server.Close()

	outputDir := "./tmp/export_test_preaction"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:      true,
		WindowWidth:   1280,
		WindowHeight:  720,
		Timeout:       60,
		WaitSelector:  `[data-export-ready="true"]`,
		WaitTimeout:   10,
		ExtraWaitTime: 1,
		OutputDir:     outputDir,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := exporter.Export(ctx, &ExportRequest{
		ReportID:   "test-report-003",
		ReportName: "预操作测试",
		Format:     FormatPNG,
		PageURL:    server.URL,
		PreActions: []ExportAction{
			{
				Type:     ActionClick,
				Selector: "#expand-btn",
				Message:  "点击展开按钮",
				Timeout:  5,
			},
			{
				Type:     ActionSleep,
				Duration: 1,
				Message:  "等待动画完成",
			},
		},
	}, func(progress int32, message string) {
		t.Logf("Progress: %d%% - %s", progress, message)
	})

	if err != nil {
		t.Fatalf("Export with pre-actions failed: %v", err)
	}

	t.Logf("Export with pre-actions completed: %s", result.FilePath)
}

// TestExportWithJSEval 测试执行 JavaScript
func TestExportWithJSEval(t *testing.T) {
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	testHTMLForEval := `<!DOCTYPE html>
<html>
<head><title>JS Eval Test</title></head>
<body>
    <div id="container">
        <p id="status">未修改</p>
    </div>
    <div data-export-ready="true"></div>
</body>
</html>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(testHTMLForEval))
	}))
	defer server.Close()

	outputDir := "./tmp/export_test_eval"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:     true,
		WindowWidth:  1280,
		WindowHeight: 720,
		Timeout:      60,
		WaitSelector: `[data-export-ready="true"]`,
		WaitTimeout:  10,
		OutputDir:    outputDir,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := exporter.Export(ctx, &ExportRequest{
		ReportID:   "test-report-004",
		ReportName: "JS执行测试",
		Format:     FormatPNG,
		PageURL:    server.URL,
		PreActions: []ExportAction{
			{
				Type:    ActionEval,
				Script:  `document.getElementById('status').textContent = '已通过JS修改'`,
				Message: "执行 JavaScript",
			},
			{
				Type:    ActionEval,
				Script:  `document.body.setAttribute('data-exporting', 'true')`,
				Message: "设置导出模式",
			},
		},
	}, nil)

	if err != nil {
		t.Fatalf("Export with JS eval failed: %v", err)
	}

	t.Logf("Export with JS eval completed: %s", result.FilePath)
}

// ============================================
// 便捷方法测试
// ============================================

// TestDefaultReportExportActions 测试默认导出操作序列
func TestDefaultReportExportActions(t *testing.T) {
	actions := DefaultReportExportActions()

	if len(actions) == 0 {
		t.Fatal("DefaultReportExportActions returned empty slice")
	}

	// 验证第一个操作是进入导出模式
	firstAction := actions[0]
	if firstAction.Type != ActionEval {
		t.Errorf("First action should be eval, got %s", firstAction.Type)
	}

	// 打印所有操作
	for i, action := range actions {
		t.Logf("Action %d: type=%s, message=%s", i+1, action.Type, action.Message)
	}
}

// TestSimpleReportExportActions 测试简化导出操作序列
func TestSimpleReportExportActions(t *testing.T) {
	actions := SimpleReportExportActions()

	if len(actions) == 0 {
		t.Fatal("SimpleReportExportActions returned empty slice")
	}

	// 简化版应该比默认版少
	defaultActions := DefaultReportExportActions()
	if len(actions) >= len(defaultActions) {
		t.Error("Simple actions should have fewer steps than default actions")
	}

	for i, action := range actions {
		t.Logf("Simple Action %d: type=%s, message=%s", i+1, action.Type, action.Message)
	}
}

// ============================================
// 错误处理测试
// ============================================

// TestExportInvalidURL 测试无效 URL
func TestExportInvalidURL(t *testing.T) {
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	outputDir := "./tmp/export_test_invalid"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:    true,
		Timeout:     10,
		WaitTimeout: 5,
		OutputDir:   outputDir,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := exporter.Export(ctx, &ExportRequest{
		ReportName: "Invalid",
		Format:     FormatPDF,
		PageURL:    "http://localhost:99999/nonexistent",
	}, nil)

	if err == nil {
		t.Error("Expected error for invalid URL, got nil")
	} else {
		t.Logf("Got expected error: %v", err)
	}
}

// TestExportEmptyURL 测试空 URL
func TestExportEmptyURL(t *testing.T) {
	exporter := NewExporter(nil)

	_, err := exporter.Export(context.Background(), &ExportRequest{
		ReportName: "Empty URL",
		Format:     FormatPDF,
		PageURL:    "",
	}, nil)

	if err == nil {
		t.Error("Expected error for empty URL, got nil")
	}
}

// TestExportTimeout 测试超时
func TestExportTimeout(t *testing.T) {
	if os.Getenv("SKIP_CHROME_TESTS") == "1" {
		t.Skip("Skipping Chrome tests (SKIP_CHROME_TESTS=1)")
	}

	// 创建一个永远不会响应的服务器
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Second) // 模拟超时
	}))
	defer server.Close()

	outputDir := "./tmp/export_test_timeout"
	os.MkdirAll(outputDir, 0755)

	exporter := NewExporter(&ExportConfig{
		Headless:  true,
		Timeout:   5, // 5 秒超时
		OutputDir: outputDir,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := exporter.Export(ctx, &ExportRequest{
		ReportName: "Timeout Test",
		Format:     FormatPDF,
		PageURL:    server.URL,
	}, nil)

	if err == nil {
		t.Error("Expected timeout error, got nil")
	} else {
		t.Logf("Got expected timeout error: %v", err)
	}
}

// ============================================
// 辅助函数测试
// ============================================

// TestSanitizeFilename 测试文件名清理
func TestSanitizeFilename(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"normal_name", "normal_name"},
		{"name with spaces", "name_with_spaces"},
		{"name/with/slashes", "name_with_slashes"},
		{"name:with:colons", "name_with_colons"},
		{"name<with>special*chars?", "name_with_special_chars_"},
		{"", "report"},
		{"a_very_long_name_that_exceeds_fifty_characters_and_should_be_truncated", "a_very_long_name_that_exceeds_fifty_characters_and"},
	}

	for _, tc := range testCases {
		result := sanitizeFilename(tc.input)
		if result != tc.expected {
			t.Errorf("sanitizeFilename(%q) = %q, expected %q", tc.input, result, tc.expected)
		}
	}
}

package export

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
)

var logger = ablog.NewLogger("export")

// Exporter 导出器
type Exporter struct {
	config *ExportConfig
}

// NewExporter 创建导出器
func NewExporter(config *ExportConfig) *Exporter {
	if config == nil {
		config = DefaultConfig()
	}
	return &Exporter{
		config: config,
	}
}

// Export 执行导出
//
// 参数:
//   - ctx: 上下文
//   - req: 导出请求
//   - onProgress: 进度回调（可选）
//
// 返回:
//   - *ExportResult: 导出结果
//   - error: 错误信息
func (e *Exporter) Export(ctx context.Context, req *ExportRequest, onProgress func(progress int32, message string)) (*ExportResult, error) {
	if req.PageURL == "" {
		return nil, fmt.Errorf("page URL is required")
	}

	if req.Format == "" {
		req.Format = FormatPDF
	}

	// 生成任务 ID 和文件路径
	taskID := uuid.New().String()
	var filename string
	switch req.Format {
	case FormatPDF:
		filename = fmt.Sprintf("%s_%s.pdf", sanitizeFilename(req.ReportName), time.Now().Format("20060102_150405"))
	case FormatPNG:
		filename = fmt.Sprintf("%s_%s.png", sanitizeFilename(req.ReportName), time.Now().Format("20060102_150405"))
	default:
		return nil, fmt.Errorf("unsupported format: %s", req.Format)
	}

	// 创建输出目录
	outputDir := filepath.Join(e.config.OutputDir, taskID)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create output directory: %w", err)
	}

	filePath := filepath.Join(outputDir, filename)

	// 设置超时
	timeout := time.Duration(e.config.Timeout) * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 进度回调
	progress := func(p int32, msg string) {
		if onProgress != nil {
			onProgress(p, msg)
		}
		logger.Info("[Export] Progress: %d%% - %s", p, msg)
	}

	progress(10, "正在启动浏览器...")

	// 创建 Chrome 实例
	var allocCtx context.Context
	var allocCancel context.CancelFunc

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", e.config.Headless),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-web-security", true),
		chromedp.WindowSize(e.config.WindowWidth, e.config.WindowHeight),
		// 设置中国时区，避免时间显示差8小时
		chromedp.Env("TZ=Asia/Shanghai"),
	)

	if e.config.ChromePath != "" {
		opts = append(opts, chromedp.ExecPath(e.config.ChromePath))
	}

	allocCtx, allocCancel = chromedp.NewExecAllocator(ctx, opts...)
	defer allocCancel()

	chromeCtx, chromeCancel := chromedp.NewContext(allocCtx)
	defer chromeCancel()

	progress(20, "正在加载页面...")

	// 导航到页面
	if err := chromedp.Run(chromeCtx, chromedp.Navigate(req.PageURL)); err != nil {
		return nil, fmt.Errorf("failed to navigate to page: %w", err)
	}

	progress(30, "等待页面加载...")

	// 等待页面基础加载完成
	waitTimeout := time.Duration(e.config.WaitTimeout) * time.Second
	waitCtx, waitCancel := context.WithTimeout(chromeCtx, waitTimeout)
	defer waitCancel()

	if e.config.WaitSelector != "" {
		if err := chromedp.Run(waitCtx, chromedp.WaitVisible(e.config.WaitSelector, chromedp.ByQuery)); err != nil {
			logger.Warn("[Export] Wait selector timeout, continuing anyway: %v", err)
		}
	}

	// 执行导出前操作序列
	if len(req.PreActions) > 0 {
		progress(40, "执行导出前操作...")

		actionProgress := int32(40)
		actionStep := int32(20) / int32(len(req.PreActions)) // 40-60 的进度分配给操作

		for i, action := range req.PreActions {
			msg := action.Message
			if msg == "" {
				msg = fmt.Sprintf("执行操作 %d/%d...", i+1, len(req.PreActions))
			}
			progress(actionProgress, msg)

			if err := e.executeAction(chromeCtx, action); err != nil {
				logger.Warn("[Export] Action %d failed (continuing): %v", i+1, err)
				// 大部分操作失败不应该阻止导出，只是记录警告
			}

			actionProgress += actionStep
		}
	}

	// 额外等待时间（让图表等异步内容渲染完成）
	if e.config.ExtraWaitTime > 0 {
		progress(60, "等待内容渲染完成...")
		time.Sleep(time.Duration(e.config.ExtraWaitTime) * time.Second)
	}

	progress(70, "正在生成文件...")

	// 根据格式执行导出
	var data []byte
	var err error

	switch req.Format {
	case FormatPDF:
		data, err = e.exportPDF(chromeCtx)
	case FormatPNG:
		data, err = e.exportPNG(chromeCtx)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to export: %w", err)
	}

	progress(90, "正在保存文件...")

	// 保存文件
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

	// 获取文件大小
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	progress(100, "导出完成")

	result := &ExportResult{
		TaskID:      taskID,
		FilePath:    filePath,
		DownloadURL: fmt.Sprintf("/api/export/v1/download/%s", taskID),
		FileSize:    fileInfo.Size(),
	}

	logger.Info("[Export] Export completed: taskID=%s, format=%s, size=%d bytes", taskID, req.Format, fileInfo.Size())

	return result, nil
}

// executeAction 执行单个导出前操作
func (e *Exporter) executeAction(ctx context.Context, action ExportAction) error {
	timeout := action.Timeout
	if timeout <= 0 {
		timeout = 30
	}
	actionCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	switch action.Type {
	case ActionClick:
		return e.actionClick(actionCtx, action.Selector)

	case ActionWaitVisible:
		return e.actionWaitVisible(actionCtx, action.Selector)

	case ActionWaitHidden:
		return e.actionWaitHidden(actionCtx, action.Selector)

	case ActionWaitNetwork:
		return e.actionWaitNetwork(actionCtx)

	case ActionSleep:
		duration := action.Duration
		if duration <= 0 {
			duration = 1
		}
		time.Sleep(time.Duration(duration) * time.Second)
		return nil

	case ActionEval:
		return e.actionEval(actionCtx, action.Script)

	case ActionScrollToBottom:
		return e.actionScrollToBottom(actionCtx)

	case ActionWaitStreamComplete:
		interval := action.Interval
		if interval <= 0 {
			interval = 500
		}
		return e.actionWaitStreamComplete(actionCtx, action.Selector, interval)

	default:
		return fmt.Errorf("unknown action type: %s", action.Type)
	}
}

// actionClick 点击元素
func (e *Exporter) actionClick(ctx context.Context, selector string) error {
	if selector == "" {
		return fmt.Errorf("selector is required for click action")
	}

	// 先等待元素可见
	if err := chromedp.Run(ctx, chromedp.WaitVisible(selector, chromedp.ByQuery)); err != nil {
		return fmt.Errorf("element not visible: %w", err)
	}

	// 点击元素
	if err := chromedp.Run(ctx, chromedp.Click(selector, chromedp.ByQuery)); err != nil {
		return fmt.Errorf("click failed: %w", err)
	}

	// 等待一小段时间让点击效果生效
	time.Sleep(300 * time.Millisecond)

	logger.Debug("[Export] Clicked: %s", selector)
	return nil
}

// actionWaitVisible 等待元素可见
func (e *Exporter) actionWaitVisible(ctx context.Context, selector string) error {
	if selector == "" {
		return fmt.Errorf("selector is required for wait_visible action")
	}

	if err := chromedp.Run(ctx, chromedp.WaitVisible(selector, chromedp.ByQuery)); err != nil {
		return fmt.Errorf("wait visible failed: %w", err)
	}

	logger.Debug("[Export] Element visible: %s", selector)
	return nil
}

// actionWaitHidden 等待元素隐藏
func (e *Exporter) actionWaitHidden(ctx context.Context, selector string) error {
	if selector == "" {
		return fmt.Errorf("selector is required for wait_hidden action")
	}

	if err := chromedp.Run(ctx, chromedp.WaitNotVisible(selector, chromedp.ByQuery)); err != nil {
		return fmt.Errorf("wait hidden failed: %w", err)
	}

	logger.Debug("[Export] Element hidden: %s", selector)
	return nil
}

// actionWaitNetwork 等待网络空闲
func (e *Exporter) actionWaitNetwork(ctx context.Context) error {
	// 启用网络监听
	if err := chromedp.Run(ctx, network.Enable()); err != nil {
		return fmt.Errorf("enable network failed: %w", err)
	}

	// 简单的网络空闲检测：等待一段时间没有新请求
	// 更复杂的实现可以使用 network.EventLoadingFinished
	time.Sleep(2 * time.Second)

	logger.Debug("[Export] Network idle")
	return nil
}

// actionEval 执行 JavaScript
func (e *Exporter) actionEval(ctx context.Context, script string) error {
	if script == "" {
		return fmt.Errorf("script is required for eval action")
	}

	var result interface{}
	if err := chromedp.Run(ctx, chromedp.Evaluate(script, &result)); err != nil {
		return fmt.Errorf("eval failed: %w", err)
	}

	logger.Debug("[Export] Eval executed, result: %v", result)
	return nil
}

// actionScrollToBottom 滚动到页面底部
func (e *Exporter) actionScrollToBottom(ctx context.Context) error {
	script := `window.scrollTo(0, document.body.scrollHeight)`
	if err := chromedp.Run(ctx, chromedp.Evaluate(script, nil)); err != nil {
		return fmt.Errorf("scroll to bottom failed: %w", err)
	}

	// 等待滚动动画完成
	time.Sleep(500 * time.Millisecond)

	logger.Debug("[Export] Scrolled to bottom")
	return nil
}

// actionWaitStreamComplete 等待流式输出完成
// 通过检测元素内容是否稳定（不再变化）来判断
func (e *Exporter) actionWaitStreamComplete(ctx context.Context, selector string, intervalMs int) error {
	if selector == "" {
		return fmt.Errorf("selector is required for wait_stream_complete action")
	}

	// 先等待元素存在
	if err := chromedp.Run(ctx, chromedp.WaitVisible(selector, chromedp.ByQuery)); err != nil {
		return fmt.Errorf("element not found: %w", err)
	}

	var lastContent string
	stableCount := 0
	requiredStableCount := 3 // 连续 3 次内容不变则认为完成

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			var currentContent string
			// 获取元素的 textContent
			script := fmt.Sprintf(`document.querySelector('%s')?.textContent || ''`, selector)
			if err := chromedp.Run(ctx, chromedp.Evaluate(script, &currentContent)); err != nil {
				logger.Warn("[Export] Failed to get content: %v", err)
				continue
			}

			if currentContent == lastContent {
				stableCount++
				if stableCount >= requiredStableCount {
					logger.Debug("[Export] Stream complete: content stable after %d checks", stableCount)
					return nil
				}
			} else {
				stableCount = 0
				lastContent = currentContent
			}
		}
	}
}

// exportPDF 导出为 PDF
func (e *Exporter) exportPDF(ctx context.Context) ([]byte, error) {
	var buf []byte

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		var err error
		buf, _, err = page.PrintToPDF().
			WithPrintBackground(e.config.PrintBackground).
			WithPaperWidth(e.config.PaperWidth).
			WithPaperHeight(e.config.PaperHeight).
			WithMarginTop(e.config.MarginTop).
			WithMarginBottom(e.config.MarginBottom).
			WithMarginLeft(e.config.MarginLeft).
			WithMarginRight(e.config.MarginRight).
			Do(ctx)
		return err
	})); err != nil {
		return nil, fmt.Errorf("PDF generation failed: %w", err)
	}

	return buf, nil
}

// exportPNG 导出为 PNG（分段截图拼接，解决大页面渲染不完整问题）
func (e *Exporter) exportPNG(ctx context.Context) ([]byte, error) {
	// 1. 先滚动到底部，触发所有懒加载内容渲染
	if err := chromedp.Run(ctx, chromedp.Evaluate(`
		(async () => {
			const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
			const scrollHeight = document.documentElement.scrollHeight;
			const viewportHeight = window.innerHeight;
			
			// 分段滚动到底部，每次滚动后等待图表渲染
			for (let y = 0; y < scrollHeight; y += viewportHeight) {
				window.scrollTo(0, y);
				await delay(150);
			}
			
			// 滚动到底部
			window.scrollTo(0, scrollHeight);
			await delay(500);
			
			// 滚动回顶部
			window.scrollTo(0, 0);
			await delay(300);
		})()
	`, nil)); err != nil {
		logger.Warn("[Export] Scroll failed (continuing): %v", err)
	}

	// 2. 等待渲染完成
	time.Sleep(2 * time.Second)

	// 3. 获取页面尺寸信息
	var pageWidth, pageHeight int64
	if err := chromedp.Run(ctx, chromedp.Evaluate(`document.documentElement.scrollWidth`, &pageWidth)); err != nil {
		return nil, fmt.Errorf("failed to get page width: %w", err)
	}
	if err := chromedp.Run(ctx, chromedp.Evaluate(`document.documentElement.scrollHeight`, &pageHeight)); err != nil {
		return nil, fmt.Errorf("failed to get page height: %w", err)
	}

	logger.Info("[Export] Page size: %dx%d", pageWidth, pageHeight)

	// 4. Chrome 纹理限制约 16384 像素，我们使用更保守的分段高度（8000像素）
	const maxSegmentHeight int64 = 8000
	viewportHeight := int64(e.config.WindowHeight)
	if viewportHeight > maxSegmentHeight {
		viewportHeight = maxSegmentHeight
	}

	// 如果页面不太高，直接使用 FullScreenshot
	if pageHeight <= maxSegmentHeight {
		logger.Info("[Export] Page height <= %d, using direct full screenshot", maxSegmentHeight)

		// 设置视口为页面完整高度
		if err := chromedp.Run(ctx, chromedp.EmulateViewport(pageWidth, pageHeight, chromedp.EmulateScale(e.config.ImageScale))); err != nil {
			return nil, fmt.Errorf("failed to set viewport: %w", err)
		}
		time.Sleep(1 * time.Second)

		var buf []byte
		if err := chromedp.Run(ctx, chromedp.FullScreenshot(&buf, 0)); err != nil {
			return nil, fmt.Errorf("screenshot failed: %w", err)
		}
		return buf, nil
	}

	// 5. 页面太高，使用分段截图拼接
	logger.Info("[Export] Page height > %d, using segmented screenshot", maxSegmentHeight)

	// 创建分段调试目录
	segmentDir := filepath.Join(e.config.OutputDir, "segments")
	if err := os.MkdirAll(segmentDir, 0755); err != nil {
		logger.Warn("[Export] Failed to create segment debug dir: %v", err)
	}

	// 禁用页面的滚动事件处理器，防止 JavaScript 干扰滚动
	disableScrollJS := `
		// 禁用 smooth scroll
		document.documentElement.style.scrollBehavior = 'auto';
		document.body.style.scrollBehavior = 'auto';
		
		// 移除所有滚动事件监听器
		window.onscroll = null;
		document.onscroll = null;
		
		// 禁用 IntersectionObserver（可能导致自动滚动）
		if (window._originalIntersectionObserver === undefined) {
			window._originalIntersectionObserver = window.IntersectionObserver;
			window.IntersectionObserver = function() {
				return { observe: function(){}, unobserve: function(){}, disconnect: function(){} };
			};
		}
		
		// 移除可能监听滚动的事件
		const events = ['scroll', 'wheel', 'touchmove'];
		events.forEach(eventType => {
			window.addEventListener(eventType, function(e) {}, { passive: true });
		});
		
		// 强制停止所有动画
		document.getAnimations && document.getAnimations().forEach(a => a.cancel());
		
		'scroll handlers disabled';
	`
	if err := chromedp.Run(ctx, chromedp.Evaluate(disableScrollJS, nil)); err != nil {
		logger.Warn("[Export] Failed to disable scroll handlers: %v", err)
	}
	logger.Info("[Export] Disabled page scroll handlers")

	// 设置固定视口用于分段截图（不使用 scale，避免复杂性）
	if err := chromedp.Run(ctx, chromedp.EmulateViewport(pageWidth, viewportHeight)); err != nil {
		return nil, fmt.Errorf("failed to set viewport: %w", err)
	}
	time.Sleep(500 * time.Millisecond)

	// 强制滚动到顶部并等待稳定
	scrollToTopJS := `
		window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		window.scrollY;
	`
	var scrollPos int64
	if err := chromedp.Run(ctx, chromedp.Evaluate(scrollToTopJS, &scrollPos)); err != nil {
		return nil, fmt.Errorf("failed to scroll to top: %w", err)
	}
	logger.Info("[Export] Scrolled to top, position: %d", scrollPos)
	time.Sleep(500 * time.Millisecond)

	// 获取实际截图的尺寸（第一张用于确定）
	var firstSegmentBuf []byte
	if err := chromedp.Run(ctx, chromedp.CaptureScreenshot(&firstSegmentBuf)); err != nil {
		return nil, fmt.Errorf("first segment screenshot failed: %w", err)
	}
	firstImg, err := png.Decode(bytes.NewReader(firstSegmentBuf))
	if err != nil {
		return nil, fmt.Errorf("failed to decode first segment: %w", err)
	}

	// 保存第一个分段用于调试
	segmentPath := filepath.Join(segmentDir, fmt.Sprintf("segment_%02d_scrollY_0.png", 0))
	if err := os.WriteFile(segmentPath, firstSegmentBuf, 0644); err != nil {
		logger.Warn("[Export] Failed to save segment 0: %v", err)
	} else {
		logger.Info("[Export] Saved segment 0: %s", segmentPath)
	}

	// 计算实际的像素缩放比（截图尺寸 / 视口尺寸）
	actualSegmentWidth := firstImg.Bounds().Dx()
	actualSegmentHeight := firstImg.Bounds().Dy()
	scaleRatio := float64(actualSegmentWidth) / float64(pageWidth)

	logger.Info("[Export] Segment size: %dx%d, scale ratio: %.2f", actualSegmentWidth, actualSegmentHeight, scaleRatio)

	// 计算最终图像尺寸
	finalWidth := actualSegmentWidth
	finalHeight := int(float64(pageHeight) * scaleRatio)

	// 创建最终图像
	finalImage := image.NewRGBA(image.Rect(0, 0, finalWidth, finalHeight))

	// 放入第一张截图
	draw.Draw(finalImage, image.Rect(0, 0, actualSegmentWidth, actualSegmentHeight),
		firstImg, image.Point{0, 0}, draw.Src)

	logger.Info("[Export] Segment 0: scrollY=0, destY=0, height=%d", actualSegmentHeight)

	// 继续分段截图
	var currentY int64 = viewportHeight
	segmentIndex := 1
	for currentY < pageHeight {
		// 滚动到当前位置（带重试机制）
		var actualScrollY int64
		maxRetries := 5
		for retry := 0; retry < maxRetries; retry++ {
			// 执行滚动
			if err := chromedp.Run(ctx, chromedp.Evaluate(fmt.Sprintf(`window.scrollTo(0, %d)`, currentY), nil)); err != nil {
				return nil, fmt.Errorf("failed to scroll to %d: %w", currentY, err)
			}
			time.Sleep(200 * time.Millisecond)

			// 验证实际滚动位置
			if err := chromedp.Run(ctx, chromedp.Evaluate(`Math.round(window.scrollY || window.pageYOffset)`, &actualScrollY)); err != nil {
				logger.Warn("[Export] Failed to get actual scroll position: %v", err)
				continue
			}

			// 允许 5 像素的误差
			if abs(actualScrollY-currentY) <= 5 {
				break
			}

			logger.Warn("[Export] Scroll mismatch (retry %d/%d)! Expected: %d, Actual: %d",
				retry+1, maxRetries, currentY, actualScrollY)
			time.Sleep(300 * time.Millisecond)
		}

		// 最终验证
		if abs(actualScrollY-currentY) > 5 {
			logger.Warn("[Export] Final scroll position mismatch! Expected: %d, Actual: %d (proceeding anyway)", currentY, actualScrollY)
		}

		// 截取当前视口
		var segmentBuf []byte
		if err := chromedp.Run(ctx, chromedp.CaptureScreenshot(&segmentBuf)); err != nil {
			return nil, fmt.Errorf("segment screenshot failed at y=%d: %w", currentY, err)
		}

		// 保存分段用于调试（使用实际滚动位置命名）
		segmentPath := filepath.Join(segmentDir, fmt.Sprintf("segment_%02d_scrollY_%d_actual_%d.png", segmentIndex, currentY, actualScrollY))
		if err := os.WriteFile(segmentPath, segmentBuf, 0644); err != nil {
			logger.Warn("[Export] Failed to save segment %d: %v", segmentIndex, err)
		} else {
			logger.Info("[Export] Saved segment %d: %s", segmentIndex, segmentPath)
		}

		// 解码 PNG
		segmentImg, err := png.Decode(bytes.NewReader(segmentBuf))
		if err != nil {
			return nil, fmt.Errorf("failed to decode segment image: %w", err)
		}

		// 计算在最终图像中的位置（按比例缩放）
		destY := int(float64(currentY) * scaleRatio)
		segHeight := segmentImg.Bounds().Dy()

		// 如果最后一段超出边界，裁剪
		if destY+segHeight > finalHeight {
			segHeight = finalHeight - destY
		}

		// 复制到最终图像
		draw.Draw(finalImage, image.Rect(0, destY, finalWidth, destY+segHeight),
			segmentImg, image.Point{0, 0}, draw.Src)

		logger.Info("[Export] Segment %d: scrollY=%d, destY=%d, height=%d",
			segmentIndex, currentY, destY, segHeight)

		currentY += viewportHeight
		segmentIndex++
	}

	logger.Info("[Export] Stitched %d segments into final image (%dx%d)", segmentIndex, finalWidth, finalHeight)

	// 编码为 PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, finalImage); err != nil {
		return nil, fmt.Errorf("failed to encode final image: %w", err)
	}

	return buf.Bytes(), nil
}

// ExportPDF 便捷方法：导出 PDF
func (e *Exporter) ExportPDF(ctx context.Context, pageURL, reportName string, onProgress func(int32, string)) (*ExportResult, error) {
	return e.Export(ctx, &ExportRequest{
		PageURL:    pageURL,
		ReportName: reportName,
		Format:     FormatPDF,
	}, onProgress)
}

// ExportPNG 便捷方法：导出 PNG
func (e *Exporter) ExportPNG(ctx context.Context, pageURL, reportName string, onProgress func(int32, string)) (*ExportResult, error) {
	return e.Export(ctx, &ExportRequest{
		PageURL:    pageURL,
		ReportName: reportName,
		Format:     FormatPNG,
	}, onProgress)
}

// ExportReportPDF 导出报告为 PDF（带完整的导出前操作）
// 这是一个专门针对报告详情页面的便捷方法
func (e *Exporter) ExportReportPDF(ctx context.Context, pageURL, reportID, reportName string, onProgress func(int32, string)) (*ExportResult, error) {
	return e.Export(ctx, &ExportRequest{
		ReportID:   reportID,
		ReportName: reportName,
		Format:     FormatPDF,
		PageURL:    pageURL,
		PreActions: DefaultReportExportActions(),
	}, onProgress)
}

// ExportReportPNG 导出报告为 PNG（带完整的导出前操作）
func (e *Exporter) ExportReportPNG(ctx context.Context, pageURL, reportID, reportName string, onProgress func(int32, string)) (*ExportResult, error) {
	return e.Export(ctx, &ExportRequest{
		ReportID:   reportID,
		ReportName: reportName,
		Format:     FormatPNG,
		PageURL:    pageURL,
		PreActions: DefaultReportExportActions(),
	}, onProgress)
}

// DefaultReportExportActions 返回报告导出的默认操作序列
// 用于专用导出页面 /report/:id/export，该页面已默认展开所有内容
// 只需等待渲染完成即可
func DefaultReportExportActions() []ExportAction {
	return []ExportAction{
		// 1. 等待页面渲染完成标识
		{
			Type:     ActionWaitVisible,
			Selector: "[data-export-complete=\"true\"]",
			Message:  "等待页面渲染完成...",
			Timeout:  120, // 给足时间加载大量数据
		},
		// 2. 滚动到底部确保所有内容加载
		{
			Type:    ActionScrollToBottom,
			Message: "加载完整内容...",
		},
		// 3. 等待网络空闲
		{
			Type:    ActionWaitNetwork,
			Message: "等待数据传输完成...",
			Timeout: 10,
		},
		// 4. 额外等待确保一切就绪
		{
			Type:     ActionSleep,
			Duration: 1,
			Message:  "最终渲染...",
		},
	}
}

// SimpleReportExportActions 返回简化版的报告导出操作序列（无需等待 AI）
func SimpleReportExportActions() []ExportAction {
	return []ExportAction{
		// 1. 等待页面渲染完成标识
		{
			Type:     ActionWaitVisible,
			Selector: "[data-export-complete=\"true\"]",
			Message:  "等待页面渲染完成...",
			Timeout:  60,
		},
		// 2. 滚动到底部
		{
			Type:    ActionScrollToBottom,
			Message: "加载完整内容...",
		},
		// 4. 等待图表渲染
		{
			Type:     ActionSleep,
			Duration: 3,
			Message:  "等待渲染...",
		},
	}
}

// sanitizeFilename 清理文件名，移除不安全字符
func sanitizeFilename(name string) string {
	if name == "" {
		return "report"
	}

	// 替换不安全字符
	unsafe := []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|", " "}
	result := name
	for _, char := range unsafe {
		result = replaceAll(result, char, "_")
	}

	// 限制长度
	if len(result) > 50 {
		result = result[:50]
	}

	return result
}

// replaceAll 替换所有匹配的字符串
func replaceAll(s, old, new string) string {
	for {
		idx := indexOf(s, old)
		if idx == -1 {
			break
		}
		s = s[:idx] + new + s[idx+len(old):]
	}
	return s
}

// indexOf 查找子串位置
func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// abs 返回 int64 的绝对值
func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

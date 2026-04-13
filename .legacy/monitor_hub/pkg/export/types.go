package export

import "time"

// ExportFormat 导出格式
type ExportFormat string

const (
	FormatPDF ExportFormat = "pdf"
	FormatPNG ExportFormat = "png"
)

// ExportStatus 导出状态
type ExportStatus string

const (
	StatusQueued     ExportStatus = "queued"     // 排队中
	StatusProcessing ExportStatus = "processing" // 处理中
	StatusCompleted  ExportStatus = "completed"  // 已完成
	StatusFailed     ExportStatus = "failed"     // 失败
)

// ExportTask 导出任务
type ExportTask struct {
	ID          string       `json:"id"`           // 任务 ID
	ReportID    string       `json:"report_id"`    // 报告 ID
	ReportName  string       `json:"report_name"`  // 报告名称
	Format      ExportFormat `json:"format"`       // 导出格式
	Status      ExportStatus `json:"status"`       // 任务状态
	Progress    int32        `json:"progress"`     // 进度 (0-100)
	Message     string       `json:"message"`      // 状态消息
	DownloadURL string       `json:"download_url"` // 下载地址
	FilePath    string       `json:"file_path"`    // 文件存储路径
	Error       string       `json:"error"`        // 错误信息
	CreatedAt   time.Time    `json:"created_at"`   // 创建时间
	CompletedAt time.Time    `json:"completed_at"` // 完成时间
	ExpiresAt   time.Time    `json:"expires_at"`   // 过期时间
}

// ExportRequest 导出请求
type ExportRequest struct {
	ReportID   string         `json:"report_id"`   // 报告 ID
	ReportName string         `json:"report_name"` // 报告名称
	Format     ExportFormat   `json:"format"`      // 导出格式 (pdf/png)
	PageURL    string         `json:"page_url"`    // 要导出的页面 URL
	PreActions []ExportAction `json:"pre_actions"` // 导出前执行的操作序列
}

// ActionType 操作类型
type ActionType string

const (
	// ActionClick 点击元素
	ActionClick ActionType = "click"
	// ActionWaitVisible 等待元素可见
	ActionWaitVisible ActionType = "wait_visible"
	// ActionWaitHidden 等待元素隐藏/消失
	ActionWaitHidden ActionType = "wait_hidden"
	// ActionWaitNetwork 等待网络空闲
	ActionWaitNetwork ActionType = "wait_network"
	// ActionSleep 等待固定时间
	ActionSleep ActionType = "sleep"
	// ActionEval 执行 JavaScript
	ActionEval ActionType = "eval"
	// ActionScrollToBottom 滚动到页面底部
	ActionScrollToBottom ActionType = "scroll_to_bottom"
	// ActionWaitStreamComplete 等待流式输出完成（检测元素内容不再变化）
	ActionWaitStreamComplete ActionType = "wait_stream_complete"
)

// ExportAction 导出前操作
type ExportAction struct {
	Type     ActionType `json:"type"`               // 操作类型
	Selector string     `json:"selector,omitempty"` // CSS 选择器（用于 click, wait_visible, wait_hidden, wait_stream_complete）
	Script   string     `json:"script,omitempty"`   // JavaScript 代码（用于 eval）
	Timeout  int        `json:"timeout,omitempty"`  // 超时时间（秒），默认 30
	Duration int        `json:"duration,omitempty"` // 持续时间（秒，用于 sleep）
	Interval int        `json:"interval,omitempty"` // 检测间隔（毫秒，用于 wait_stream_complete），默认 500
	Message  string     `json:"message,omitempty"`  // 进度消息
}

// 预定义的常用操作 - 用于报告导出
var (
	// ActionEnterExportMode 进入导出模式（设置 body 属性，触发 CSS 隐藏不需要导出的元素）
	ActionEnterExportMode = ExportAction{
		Type:    ActionEval,
		Script:  `document.body.setAttribute('data-exporting', 'true')`,
		Message: "进入导出模式...",
	}

	// ActionExitExportMode 退出导出模式
	ActionExitExportMode = ExportAction{
		Type:   ActionEval,
		Script: `document.body.removeAttribute('data-exporting')`,
	}

	// ActionHideSidebar 隐藏侧边栏/目录
	ActionHideSidebar = ExportAction{
		Type:    ActionEval,
		Script:  `document.querySelectorAll('[data-export-hide]').forEach(el => el.style.display = 'none')`,
		Message: "隐藏导出时不需要的元素...",
	}

	// ActionExpandAllCards 展开所有卡片（点击平铺视图按钮）
	ActionExpandAllCards = ExportAction{
		Type:     ActionClick,
		Selector: "[data-export-action=\"expand-all\"]",
		Message:  "展开所有卡片...",
		Timeout:  5,
	}

	// ActionExpandAIPanel 展开 AI 分析面板
	ActionExpandAIPanel = ExportAction{
		Type:     ActionClick,
		Selector: "[data-export-action=\"expand-ai\"]",
		Message:  "展开 AI 分析面板...",
		Timeout:  5,
	}

	// ActionExpandConclusion 展开结论卡片
	ActionExpandConclusion = ExportAction{
		Type:     ActionClick,
		Selector: "[data-export-action=\"expand-conclusion\"]",
		Message:  "展开结论卡片...",
		Timeout:  5,
	}

	// ActionWaitChartsRendered 等待图表渲染完成
	ActionWaitChartsRendered = ExportAction{
		Type:     ActionWaitVisible,
		Selector: "[data-charts-rendered=\"true\"]",
		Message:  "等待图表渲染...",
		Timeout:  30,
	}

	// ActionWaitAIStreamComplete 等待 AI 流式输出完成
	ActionWaitAIStreamComplete = ExportAction{
		Type:     ActionWaitStreamComplete,
		Selector: "[data-ai-content]",
		Message:  "等待 AI 分析输出完成...",
		Timeout:  60,
		Interval: 500,
	}

	// ActionWaitNetworkIdle 等待网络空闲
	ActionWaitNetworkIdle = ExportAction{
		Type:    ActionWaitNetwork,
		Message: "等待数据加载完成...",
		Timeout: 30,
	}
)

// ExportResult 导出结果
type ExportResult struct {
	TaskID      string `json:"task_id"`
	FilePath    string `json:"file_path"`
	DownloadURL string `json:"download_url"`
	FileSize    int64  `json:"file_size"`
}

// ExportStatusEvent 导出状态事件（用于 WebSocket 推送）
type ExportStatusEvent struct {
	TaskID      string       `json:"task_id"`
	ReportID    string       `json:"report_id"`
	ReportName  string       `json:"report_name"`
	Format      ExportFormat `json:"format"`
	Status      ExportStatus `json:"status"`
	Progress    int32        `json:"progress"`
	Message     string       `json:"message"`
	DownloadURL string       `json:"download_url,omitempty"`
	Error       string       `json:"error,omitempty"`
}

// ExportConfig 导出配置
type ExportConfig struct {
	// Chrome 相关配置
	ChromePath    string `json:"chrome_path" yaml:"chrome_path"`         // Chrome 可执行文件路径（空则自动查找）
	Headless      bool   `json:"headless" yaml:"headless"`               // 是否无头模式
	WindowWidth   int    `json:"window_width" yaml:"window_width"`       // 窗口宽度
	WindowHeight  int    `json:"window_height" yaml:"window_height"`     // 窗口高度
	Timeout       int    `json:"timeout" yaml:"timeout"`                 // 超时时间（秒）
	WaitSelector  string `json:"wait_selector" yaml:"wait_selector"`     // 等待的选择器
	WaitTimeout   int    `json:"wait_timeout" yaml:"wait_timeout"`       // 等待选择器超时（秒）
	ExtraWaitTime int    `json:"extra_wait_time" yaml:"extra_wait_time"` // 额外等待时间（秒，用于图表渲染）

	// PDF 相关配置
	PaperWidth      float64 `json:"paper_width" yaml:"paper_width"`           // 纸张宽度（英寸）
	PaperHeight     float64 `json:"paper_height" yaml:"paper_height"`         // 纸张高度（英寸）
	MarginTop       float64 `json:"margin_top" yaml:"margin_top"`             // 上边距（英寸）
	MarginBottom    float64 `json:"margin_bottom" yaml:"margin_bottom"`       // 下边距（英寸）
	MarginLeft      float64 `json:"margin_left" yaml:"margin_left"`           // 左边距（英寸）
	MarginRight     float64 `json:"margin_right" yaml:"margin_right"`         // 右边距（英寸）
	PrintBackground bool    `json:"print_background" yaml:"print_background"` // 是否打印背景

	// PNG 相关配置
	ImageScale   float64 `json:"image_scale" yaml:"image_scale"`     // 图片缩放倍数
	ImageQuality int     `json:"image_quality" yaml:"image_quality"` // 图片质量 (1-100)

	// 文件存储配置
	OutputDir      string `json:"output_dir" yaml:"output_dir"`           // 输出目录
	FileExpiration int    `json:"file_expiration" yaml:"file_expiration"` // 文件过期时间（小时）
	MaxFileSize    int64  `json:"max_file_size" yaml:"max_file_size"`     // 最大文件大小（字节）
}

// DefaultConfig 返回默认配置
func DefaultConfig() *ExportConfig {
	return &ExportConfig{
		// Chrome 配置
		ChromePath:    "", // 自动查找
		Headless:      true,
		WindowWidth:   1920,
		WindowHeight:  1080,
		Timeout:       120, // 2 分钟
		WaitSelector:  "[data-export-ready=\"true\"]",
		WaitTimeout:   30,
		ExtraWaitTime: 3, // 额外等待 3 秒让图表渲染

		// PDF 配置 (A4 纸张)
		PaperWidth:      8.27,  // A4 宽度
		PaperHeight:     11.69, // A4 高度
		MarginTop:       0.5,
		MarginBottom:    0.5,
		MarginLeft:      0.4,
		MarginRight:     0.4,
		PrintBackground: true,

		// PNG 配置
		ImageScale:   2.0, // 2倍清晰度
		ImageQuality: 90,

		// 文件存储
		OutputDir:      "./exports",
		FileExpiration: 24,                // 24 小时过期
		MaxFileSize:    100 * 1024 * 1024, // 100MB
	}
}

// ToTaskInfo 转换为任务信息（用于返回给前端）
func (t *ExportTask) ToStatusEvent() *ExportStatusEvent {
	return &ExportStatusEvent{
		TaskID:      t.ID,
		ReportID:    t.ReportID,
		ReportName:  t.ReportName,
		Format:      t.Format,
		Status:      t.Status,
		Progress:    t.Progress,
		Message:     t.Message,
		DownloadURL: t.DownloadURL,
		Error:       t.Error,
	}
}

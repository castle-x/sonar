package repo

import (
	"math"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
)

const (
	DatasourceCollection = "datasource"
	ReportCollection     = "reports"
	ChunkCollection      = "chunks"
	TaskCollection       = "tasks"
)

// 通用生成分页信息结构
func newPage(total, num, page, pageSize int64) *baseV1.Page {
	if page == 0 && pageSize == 0 {
		return &baseV1.Page{
			Total: total,
			Num:   num,
			Page:  1,
		}
	}
	return &baseV1.Page{
		Total:     total,
		Num:       num,
		Page:      page,
		PageSize:  pageSize,
		TotalPage: int64(math.Ceil(float64(total) / float64(pageSize))), // 向上取整, 总页数
	}
}

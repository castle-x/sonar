package repo

import (
	"context"
	"fmt"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	reportV1 "monitor_hub/apis/monitor_hub/report/v1"
	mongodb "monitor_hub/pkg/mongodb"

	"go.mongodb.org/mongo-driver/bson"
)

// ============================================
// 类型别名（使用 thrift 定义的协议模型）
// ============================================

// ReportDocument 报告文档类型别名（方便使用）
type ReportDocument = mongodb.TypedDocument[*reportV1.Report]

// ChunkDoc Chunk 文档类型别名
type ChunkDocument = mongodb.TypedDocument[*reportV1.Chunk]

// ============================================
// Repo 接口定义
// ============================================

type ReportRepo interface {
	// Report CRUD
	CreateReport(ctx context.Context, report *reportV1.Report) (*ReportDocument, error)
	CreateReportWithID(ctx context.Context, id string, report *reportV1.Report) (*ReportDocument, error) // 使用指定ID创建（导入/转发用）
	UpdateReportInfo(ctx context.Context, id string, report *reportV1.Report) (*ReportDocument, error)
	UpdateReportDocument(ctx context.Context, doc *ReportDocument) (*ReportDocument, error)
	UpdateReportStatus(ctx context.Context, id string, status *reportV1.ReportStatus) (*ReportDocument, error)
	GetReport(ctx context.Context, id string) (*ReportDocument, error)
	ListReport(ctx context.Context, query *baseV1.QueryRequest) ([]*ReportDocument, *baseV1.Page, error)
	DeleteReport(ctx context.Context, id string) error
	UpdateReportIconName(ctx context.Context, id string, iconName string) (*ReportDocument, error)

	// Chunk CRUD
	CreateChunk(ctx context.Context, chunk *reportV1.Chunk) (*ChunkDocument, error)
	CreateChunkWithID(ctx context.Context, id string, chunk *reportV1.Chunk) (*ChunkDocument, error) // 使用指定ID创建（导入/转发用）
	GetChunk(ctx context.Context, id string) (*ChunkDocument, error)
	ListChunk(ctx context.Context, query *baseV1.QueryRequest) ([]*ChunkDocument, *baseV1.Page, error)
	DeleteChunk(ctx context.Context, id string) error
}

// ============================================
// Repo 实现
// ============================================

type reportRepoImpl struct {
	db *mongodb.MongoDB
}

func NewReportRepo(db *mongodb.MongoDB) ReportRepo {
	return &reportRepoImpl{db: db}
}

// ============================================
// Report CRUD 实现
// ============================================

func (r *reportRepoImpl) CreateReport(ctx context.Context, report *reportV1.Report) (*ReportDocument, error) {
	doc, err := mongodb.CreateDocumentTyped(r.db, ctx, ReportCollection, report)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) CreateReportWithID(ctx context.Context, id string, report *reportV1.Report) (*ReportDocument, error) {
	doc, err := mongodb.CreateDocumentTypedWithID(r.db, ctx, ReportCollection, id, report)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) UpdateReportInfo(ctx context.Context, id string, updateReport *reportV1.Report) (*ReportDocument, error) {
	// 只允许增量更新部分信息
	// 1. name (报告名称)
	// 2. description
	// 3. extra_info
	// 4. tags
	// 5. icon_path
	// 6. test_timeline
	// 7. scoring_config (评分配置)
	// 8. report_score (评分结果)
	// 9. metric_info (指标信息)
	// 10. release (发布标记)
	// 11. file_list (关联文件列表)
	// 先查询一下
	oldReportDoc, err := r.GetReport(ctx, id)
	if err != nil {
		return nil, err
	}
	// 手动替换上述可更新的字段(如果存在) 增量更新即可。
	if updateReport.Name != "" {
		oldReportDoc.Resource.Name = updateReport.Name
	}
	if updateReport.IsSetDescription() {
		oldReportDoc.Resource.Description = updateReport.Description
	}
	if updateReport.IsSetExtraInfo() {
		oldReportDoc.Resource.ExtraInfo = updateReport.ExtraInfo
	}
	if updateReport.IsSetTags() {
		oldReportDoc.Resource.Tags = updateReport.Tags
	}
	if updateReport.IsSetIconName() {
		oldReportDoc.Resource.IconName = updateReport.IconName
	}
	if updateReport.IsSetTestTimeline() {
		oldReportDoc.Resource.TestTimeline = updateReport.TestTimeline
	}
	if updateReport.IsSetScoringConfig() {
		oldReportDoc.Resource.ScoringConfig = updateReport.ScoringConfig
	}
	if updateReport.IsSetReportScore() {
		oldReportDoc.Resource.ReportScore = updateReport.ReportScore
	}
	if updateReport.IsSetMetricInfo() {
		oldReportDoc.Resource.MetricInfo = updateReport.MetricInfo
	}
	if updateReport.IsSetRelease() {
		oldReportDoc.Resource.Release = updateReport.Release
	}
	if updateReport.IsSetFileList() {
		oldReportDoc.Resource.FileList = updateReport.FileList
	}
	// 更新基础文档信息
	updatedDoc := mongodb.SetUpdateTypedDocument(oldReportDoc.Resource, oldReportDoc)
	// 更新文档
	// 构造更新查询
	filter := bson.M{
		"_id":         id,
		"markDeleted": false,
	}

	update := bson.M{"$set": updatedDoc}
	result := r.db.GetDB().FindDocAndUpdate(ctx, ReportCollection, filter, update, bson.M{"new": true})
	if result.Err() != nil {
		return nil, fmt.Errorf("failed to update document: %w", result.Err())
	}
	var finalDoc ReportDocument
	if err := result.Unmarshal(&finalDoc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal updated document: %w", err)
	}
	return &finalDoc, nil
}

func (r *reportRepoImpl) UpdateReportDocument(ctx context.Context, doc *ReportDocument) (*ReportDocument, error) {
	// 创建更新后的Document
	updatedDoc := mongodb.SetUpdateTypedDocument(doc.Resource, doc)

	// 构造更新查询
	filter := bson.M{
		"_id":         doc.Id,
		"markDeleted": false,
	}

	update := bson.M{"$set": updatedDoc}

	// 执行更新
	result := r.db.GetDB().FindDocAndUpdate(ctx, ReportCollection, filter, update, bson.M{"new": true})
	if result.Err() != nil {
		return nil, fmt.Errorf("failed to update document: %w", result.Err())
	}

	var finalDoc ReportDocument
	if err := result.Unmarshal(&finalDoc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal updated document: %w", err)
	}

	return &finalDoc, nil
}

func (r *reportRepoImpl) UpdateReportStatus(ctx context.Context, id string, status *reportV1.ReportStatus) (*ReportDocument, error) {
	report, err := r.GetReport(ctx, id)
	if err != nil {
		return nil, err
	}
	if report.Resource.ReportStatus == nil {
		report.Resource.ReportStatus = status
	}
	if status.Status != "" {
		report.Resource.ReportStatus.Status = status.Status
	}
	if status.ErrorMsg != "" {
		report.Resource.ReportStatus.ErrorMsg = status.ErrorMsg
	}
	if status.TaskID != "" {
		report.Resource.ReportStatus.TaskID = status.TaskID
	}
	doc, err := mongodb.UpdateDocumentTyped(r.db, ctx, ReportCollection, id, report.Resource)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) GetReport(ctx context.Context, id string) (*ReportDocument, error) {
	doc, err := mongodb.GetDocumentTyped[*reportV1.Report](r.db, ctx, ReportCollection, id)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) ListReport(ctx context.Context, query *baseV1.QueryRequest) ([]*ReportDocument, *baseV1.Page, error) {
	docs, total, err := mongodb.ListDocumentsTyped[*reportV1.Report](r.db, ctx, ReportCollection, &mongodb.QueryRequest{
		Page:       query.Page,
		PageSize:   query.PageSize,
		Query:      query.Query,
		Projection: query.Projection,
		Distinct:   query.Distinct,
	})
	if err != nil {
		return nil, nil, err
	}
	return docs, newPage(total, int64(len(docs)), query.Page, query.PageSize), nil
}

func (r *reportRepoImpl) DeleteReport(ctx context.Context, id string) error {
	_, err := mongodb.DeleteDocumentTyped[*reportV1.Report](r.db, ctx, ReportCollection, id)
	if err != nil {
		return err
	}
	return nil
}

// ============================================
// Chunk CRUD 实现
// ============================================

func (r *reportRepoImpl) CreateChunk(ctx context.Context, chunk *reportV1.Chunk) (*ChunkDocument, error) {
	doc, err := mongodb.CreateDocumentTyped(r.db, ctx, ChunkCollection, chunk)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) CreateChunkWithID(ctx context.Context, id string, chunk *reportV1.Chunk) (*ChunkDocument, error) {
	doc, err := mongodb.CreateDocumentTypedWithID(r.db, ctx, ChunkCollection, id, chunk)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) GetChunk(ctx context.Context, id string) (*ChunkDocument, error) {
	doc, err := mongodb.GetDocumentTyped[*reportV1.Chunk](r.db, ctx, ChunkCollection, id)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *reportRepoImpl) ListChunk(ctx context.Context, query *baseV1.QueryRequest) ([]*ChunkDocument, *baseV1.Page, error) {
	docs, total, err := mongodb.ListDocumentsTyped[*reportV1.Chunk](r.db, ctx, ChunkCollection, &mongodb.QueryRequest{
		Page:       query.Page,
		PageSize:   query.PageSize,
		Query:      query.Query,
		Projection: query.Projection,
		Distinct:   query.Distinct,
	})
	if err != nil {
		return nil, nil, err
	}
	return docs, newPage(total, int64(len(docs)), query.Page, query.PageSize), nil
}

func (r *reportRepoImpl) DeleteChunk(ctx context.Context, id string) error {
	_, err := mongodb.DeleteDocumentTyped[*reportV1.Chunk](r.db, ctx, ChunkCollection, id)
	if err != nil {
		return err
	}
	return nil
}

func (r *reportRepoImpl) UpdateReportIconName(ctx context.Context, id string, iconName string) (*ReportDocument, error) {
	// 只增量更新icon_name
	oldReportDoc, err := r.GetReport(ctx, id)
	if err != nil {
		return nil, err
	}
	// 手动替换上述可更新的字段(如果存在) 增量更新即可。
	if iconName != "" {
		oldReportDoc.Resource.ReportIconName = &iconName
	}

	// 更新基础文档信息
	updatedDoc := mongodb.SetUpdateTypedDocument(oldReportDoc.Resource, oldReportDoc)
	// 更新文档
	// 构造更新查询
	filter := bson.M{
		"_id":         id,
		"markDeleted": false,
	}

	update := bson.M{"$set": updatedDoc}
	result := r.db.GetDB().FindDocAndUpdate(ctx, ReportCollection, filter, update, bson.M{"new": true})
	if result.Err() != nil {
		return nil, fmt.Errorf("failed to update document: %w", result.Err())
	}
	var finalDoc ReportDocument
	if err := result.Unmarshal(&finalDoc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal updated document: %w", err)
	}
	return &finalDoc, nil
}

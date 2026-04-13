package repo

import (
	"context"
	"fmt"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	taskV1 "monitor_hub/apis/monitor_hub/task/v1"
	mongodb "monitor_hub/pkg/mongodb"

	"go.mongodb.org/mongo-driver/bson"
)

// ============================================
// 类型别名（使用 thrift 定义的协议模型）
// ============================================

// TaskDocument 任务文档类型别名
type TaskDocument = mongodb.TypedDocument[*taskV1.TestTask]

// ============================================
// Repo 接口定义
// ============================================

type TaskRepo interface {
	// Task CRUD
	CreateTask(ctx context.Context, task *taskV1.TestTask) (*TaskDocument, error)
	UpdateTask(ctx context.Context, id string, task *taskV1.TestTask) (*TaskDocument, error)
	GetTask(ctx context.Context, id string) (*TaskDocument, error)
	ListTask(ctx context.Context, query *baseV1.QueryRequest) ([]*TaskDocument, *baseV1.Page, error)
	DeleteTask(ctx context.Context, id string) error
}

// ============================================
// Repo 实现
// ============================================

type taskRepoImpl struct {
	db *mongodb.MongoDB
}

func NewTaskRepo(db *mongodb.MongoDB) TaskRepo {
	return &taskRepoImpl{db: db}
}

// ============================================
// Task CRUD 实现
// ============================================

func (r *taskRepoImpl) CreateTask(ctx context.Context, task *taskV1.TestTask) (*TaskDocument, error) {
	doc, err := mongodb.CreateDocumentTyped(r.db, ctx, TaskCollection, task)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *taskRepoImpl) UpdateTask(ctx context.Context, id string, updateTask *taskV1.TestTask) (*TaskDocument, error) {
	// 增量更新：只更新传入的字段
	oldTaskDoc, err := r.GetTask(ctx, id)
	if err != nil {
		return nil, err
	}

	// 手动替换可更新的字段（增量更新）
	// Name 是 required 字段，如果传入了有效值则更新
	if updateTask.Name != "" {
		oldTaskDoc.Resource.Name = updateTask.Name
	}
	if updateTask.IsSetDescription() {
		oldTaskDoc.Resource.Description = updateTask.Description
	}
	if updateTask.IsSetExtraInfo() {
		oldTaskDoc.Resource.ExtraInfo = updateTask.ExtraInfo
	}
	if updateTask.IsSetTags() {
		oldTaskDoc.Resource.Tags = updateTask.Tags
	}
	if updateTask.IsSetReportIds() {
		oldTaskDoc.Resource.ReportIds = updateTask.ReportIds
	}
	if updateTask.IsSetAppID() {
		oldTaskDoc.Resource.AppID = updateTask.AppID
	}
	if updateTask.IsSetOperator() {
		oldTaskDoc.Resource.Operator = updateTask.Operator
	}
	if updateTask.IsSetCreateType() {
		oldTaskDoc.Resource.CreateType = updateTask.CreateType
	}
	if updateTask.IsSetIconName() {
		oldTaskDoc.Resource.IconName = updateTask.IconName
	}

	// 更新基础文档信息
	updatedDoc := mongodb.SetUpdateTypedDocument(oldTaskDoc.Resource, oldTaskDoc)

	// 构造更新查询
	filter := bson.M{
		"_id":         id,
		"markDeleted": false,
	}

	update := bson.M{"$set": updatedDoc}
	result := r.db.GetDB().FindDocAndUpdate(ctx, TaskCollection, filter, update, bson.M{"new": true})
	if result.Err() != nil {
		return nil, fmt.Errorf("failed to update document: %w", result.Err())
	}

	var finalDoc TaskDocument
	if err := result.Unmarshal(&finalDoc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal updated document: %w", err)
	}
	return &finalDoc, nil
}

func (r *taskRepoImpl) GetTask(ctx context.Context, id string) (*TaskDocument, error) {
	doc, err := mongodb.GetDocumentTyped[*taskV1.TestTask](r.db, ctx, TaskCollection, id)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *taskRepoImpl) ListTask(ctx context.Context, query *baseV1.QueryRequest) ([]*TaskDocument, *baseV1.Page, error) {
	docs, total, err := mongodb.ListDocumentsTyped[*taskV1.TestTask](r.db, ctx, TaskCollection, &mongodb.QueryRequest{
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

func (r *taskRepoImpl) DeleteTask(ctx context.Context, id string) error {
	_, err := mongodb.DeleteDocumentTyped[*taskV1.TestTask](r.db, ctx, TaskCollection, id)
	if err != nil {
		return err
	}
	return nil
}

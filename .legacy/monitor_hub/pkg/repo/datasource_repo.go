package repo

import (
	"context"
	"fmt"
	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	v1 "monitor_hub/apis/monitor_hub/datasource/v1"
	mongodb "monitor_hub/pkg/mongodb"

	"github.com/bytedance/sonic"
	"go.mongodb.org/mongo-driver/bson"
)

// DatasourceDocument 数据源文档类型别名（方便使用）
type DatasourceDocument = mongodb.TypedDocument[*v1.Datasource]

type DatasourceRepo interface {
	CreateDatasource(ctx context.Context, datasource *v1.Datasource) (*DatasourceDocument, error)
	UpdateDatasource(ctx context.Context, id string, datasource *v1.Datasource) (*DatasourceDocument, error)
	GetDatasource(ctx context.Context, id string) (*DatasourceDocument, error)
	ListDatasource(ctx context.Context, query *baseV1.QueryRequest) ([]*DatasourceDocument, *baseV1.Page, error)
	DeleteDatasource(ctx context.Context, id string) error
	IsDatasourceExist(ctx context.Context, name, appID string) (bool, error)
	GetDatasourceByIds(ctx context.Context, ids []string) ([]*DatasourceDocument, error)
	UpdateDatasourceIconName(ctx context.Context, id string, iconName string) (*DatasourceDocument, error)
}

type datasourceRepoImpl struct {
	db *mongodb.MongoDB
}

func NewDatasourceRepo(db *mongodb.MongoDB) DatasourceRepo {
	return &datasourceRepoImpl{db: db}
}

func (r *datasourceRepoImpl) CreateDatasource(ctx context.Context, datasource *v1.Datasource) (*DatasourceDocument, error) {
	doc, err := mongodb.CreateDocumentTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, datasource)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *datasourceRepoImpl) UpdateDatasource(ctx context.Context, id string, datasource *v1.Datasource) (*DatasourceDocument, error) {
	doc, err := mongodb.UpdateDocumentTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, id, datasource)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *datasourceRepoImpl) GetDatasource(ctx context.Context, id string) (*DatasourceDocument, error) {
	doc, err := mongodb.GetDocumentTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, id)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (r *datasourceRepoImpl) ListDatasource(ctx context.Context, query *baseV1.QueryRequest) ([]*DatasourceDocument, *baseV1.Page, error) {
	docs, total, err := mongodb.ListDocumentsTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, &mongodb.QueryRequest{
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

func (r *datasourceRepoImpl) DeleteDatasource(ctx context.Context, id string) error {
	_, err := mongodb.DeleteDocumentTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, id)
	if err != nil {
		return err
	}
	return nil
}

func (r *datasourceRepoImpl) IsDatasourceExist(ctx context.Context, name, appID string) (bool, error) {
	total, err := mongodb.CountDocuments(r.db, ctx, DatasourceCollection, &mongodb.QueryRequest{
		Query: fmt.Sprintf(`{"name": "%s", "app_id": "%s"}`, name, appID),
	})
	if err != nil {
		return false, err
	}
	return total > 0, nil
}

func (r *datasourceRepoImpl) GetDatasourceByIds(ctx context.Context, ids []string) ([]*DatasourceDocument, error) {
	idsJson, err := sonic.Marshal(ids)
	if err != nil {
		return nil, err
	}
	docs, _, err := mongodb.ListDocumentsTyped[*v1.Datasource](r.db, ctx, DatasourceCollection, &mongodb.QueryRequest{
		Query: fmt.Sprintf(`{"_id": {"$in": %s}}`, idsJson),
	})
	if err != nil {
		return nil, err
	}
	return docs, nil
}

func (r *datasourceRepoImpl) UpdateDatasourceIconName(ctx context.Context, id string, iconName string) (*DatasourceDocument, error) {
	// 只增量更新icon_name
	oldDatasourceDoc, err := r.GetDatasource(ctx, id)
	if err != nil {
		return nil, err
	}
	// 手动替换上述可更新的字段(如果存在) 增量更新即可。
	if iconName != "" {
		oldDatasourceDoc.Resource.IconName = &iconName
	}

	// 更新基础文档信息
	updatedDoc := mongodb.SetUpdateTypedDocument(oldDatasourceDoc.Resource, oldDatasourceDoc)
	// 更新文档
	// 构造更新查询
	filter := bson.M{
		"_id":         id,
		"markDeleted": false,
	}

	update := bson.M{"$set": updatedDoc}
	result := r.db.GetDB().FindDocAndUpdate(ctx, DatasourceCollection, filter, update, bson.M{"new": true})
	if result.Err() != nil {
		return nil, fmt.Errorf("failed to update document: %w", result.Err())
	}
	var finalDoc DatasourceDocument
	if err := result.Unmarshal(&finalDoc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal updated document: %w", err)
	}
	return &finalDoc, nil
}


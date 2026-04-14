package mongodb

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/bytedance/sonic"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// QueryRequest MongoDB 查询请求
type QueryRequest struct {
	Page       int64  `json:"page" bson:"page"`
	PageSize   int64  `json:"pageSize" bson:"pageSize"`
	Query      string `json:"query" bson:"query"`
	Projection string `json:"projection" bson:"projection"`
	Distinct   string `json:"distinct" bson:"distinct"`
}

// TypedDocument 泛型文档结构
type TypedDocument[T any] struct {
	Id          string `json:"id,omitempty" bson:"_id,omitempty"`
	MarkDeleted bool   `json:"markDeleted,omitempty" bson:"markDeleted"`
	DeletedAt   int64  `json:"deletedAt,omitempty" bson:"deletedAt,omitempty"`
	CreatedAt   int64  `json:"createdAt,omitempty" bson:"createdAt,omitempty"`
	UpdatedAt   int64  `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
	Resource    T      `json:"resource,omitempty" bson:"resource,omitempty"`
}

// Config MongoDB 配置
type Config struct {
	URI     string `yaml:"uri" json:"uri"`
	DBName  string `yaml:"db_name" json:"db_name"`
	Enable  bool   `yaml:"enable" json:"enable"`
}

// MongoDB 客户端封装
type MongoDB struct {
	client *mongo.Client
	db     *mongo.Database
	cfg    Config
}

// New 创建 MongoDB 客户端
func New(cfg Config) (*MongoDB, error) {
	if !cfg.Enable {
		return &MongoDB{cfg: cfg}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.URI))
	if err != nil {
		return nil, fmt.Errorf("connect mongodb failed: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("ping mongodb failed: %w", err)
	}
	return &MongoDB{
		client: client,
		db:     client.Database(cfg.DBName),
		cfg:    cfg,
	}, nil
}

// IsEnabled 是否启用
func (m *MongoDB) IsEnabled() bool {
	return m.cfg.Enable && m.db != nil
}

// Close 关闭连接
func (m *MongoDB) Close(ctx context.Context) error {
	if m.client == nil {
		return nil
	}
	return m.client.Disconnect(ctx)
}

// SetCreateTypedDocument 创建文档辅助
func SetCreateTypedDocument[T any](userData T) *TypedDocument[T] {
	now := time.Now().Unix()
	return &TypedDocument[T]{
		Id:          primitive.NewObjectID().Hex(),
		MarkDeleted: false,
		CreatedAt:   now,
		UpdatedAt:   now,
		Resource:    userData,
	}
}

// SetUpdateTypedDocument 更新文档辅助
func SetUpdateTypedDocument[T any](userData T, existingDoc *TypedDocument[T]) *TypedDocument[T] {
	return &TypedDocument[T]{
		Id:          existingDoc.Id,
		MarkDeleted: existingDoc.MarkDeleted,
		DeletedAt:   existingDoc.DeletedAt,
		CreatedAt:   existingDoc.CreatedAt,
		UpdatedAt:   time.Now().Unix(),
		Resource:    userData,
	}
}

// CreateDocumentTyped 创建文档
func CreateDocumentTyped[T any](m *MongoDB, ctx context.Context, collection string, userData T) (*TypedDocument[T], error) {
	if !m.IsEnabled() {
		return nil, fmt.Errorf("mongodb is not enabled")
	}
	doc := SetCreateTypedDocument(userData)
	_, err := m.db.Collection(collection).InsertOne(ctx, doc)
	if err != nil {
		return nil, fmt.Errorf("insert document failed: %w", err)
	}
	return doc, nil
}

// GetDocumentTyped 获取文档
func GetDocumentTyped[T any](m *MongoDB, ctx context.Context, collection string, id string) (*TypedDocument[T], error) {
	if !m.IsEnabled() {
		return nil, fmt.Errorf("mongodb is not enabled")
	}
	filter := bson.M{"_id": id, "markDeleted": false}
	var doc TypedDocument[T]
	err := m.db.Collection(collection).FindOne(ctx, filter).Decode(&doc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("document not found: %s", id)
		}
		return nil, fmt.Errorf("find document failed: %w", err)
	}
	return &doc, nil
}

// UpdateDocumentTyped 更新文档
func UpdateDocumentTyped[T any](m *MongoDB, ctx context.Context, collection string, id string, userData T) (*TypedDocument[T], error) {
	if !m.IsEnabled() {
		return nil, fmt.Errorf("mongodb is not enabled")
	}
	existingDoc, err := GetDocumentTyped[T](m, ctx, collection, id)
	if err != nil {
		return nil, err
	}
	updatedDoc := SetUpdateTypedDocument(userData, existingDoc)
	filter := bson.M{"_id": id, "markDeleted": false}
	update := bson.M{"$set": updatedDoc}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var finalDoc TypedDocument[T]
	err = m.db.Collection(collection).FindOneAndUpdate(ctx, filter, update, opts).Decode(&finalDoc)
	if err != nil {
		return nil, fmt.Errorf("update document failed: %w", err)
	}
	return &finalDoc, nil
}

// DeleteDocumentTyped 软删除文档
func DeleteDocumentTyped[T any](m *MongoDB, ctx context.Context, collection string, id string) error {
	if !m.IsEnabled() {
		return fmt.Errorf("mongodb is not enabled")
	}
	filter := bson.M{"_id": id}
	update := bson.M{"$set": bson.M{
		"markDeleted": true,
		"deletedAt":   time.Now().Unix(),
		"updatedAt":   time.Now().Unix(),
	}}
	_, err := m.db.Collection(collection).UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("soft delete failed: %w", err)
	}
	return nil
}

// ListDocumentsTyped 列出文档
func ListDocumentsTyped[T any](m *MongoDB, ctx context.Context, collection string, req *QueryRequest) ([]*TypedDocument[T], int64, error) {
	if !m.IsEnabled() {
		return nil, 0, fmt.Errorf("mongodb is not enabled")
	}
	query := bson.M{"markDeleted": false}
	if len(req.Query) > 0 {
		queryMap := map[string]interface{}{}
		if err := sonic.Unmarshal([]byte(req.Query), &queryMap); err != nil {
			return nil, -1, fmt.Errorf("query json unmarshal error: %w", err)
		}
		for k, v := range queryMap {
			query[k] = v
		}
	}
	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	page := req.Page
	if page <= 0 {
		page = 1
	}
	skip := (page - 1) * pageSize
	findOpts := options.Find().
		SetLimit(pageSize).
		SetSkip(skip).
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}})
	cursor, err := m.db.Collection(collection).Find(ctx, query, findOpts)
	if err != nil {
		return nil, -1, fmt.Errorf("find documents failed: %w", err)
	}
	defer cursor.Close(ctx)
	var docs []*TypedDocument[T]
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, -1, fmt.Errorf("decode documents failed: %w", err)
	}
	total, err := m.db.Collection(collection).CountDocuments(ctx, query)
	if err != nil {
		return nil, -1, fmt.Errorf("count documents failed: %w", err)
	}
	if len(req.Distinct) > 0 {
		docs, err = ProcessDistinctTyped(docs, req.Distinct)
		if err != nil {
			return nil, -1, err
		}
	}
	return docs, total, nil
}

// ProcessDistinctTyped 去重
func ProcessDistinctTyped[T any](documents []*T, distinctField string) ([]*T, error) {
	if len(documents) == 0 {
		return documents, nil
	}
	distinctItems := strings.Split(distinctField, ".")
	distinctKeyMap := make(map[string]int, len(documents))
	uniqueIndices := make([]int, 0, len(documents))
	for i, doc := range documents {
		if doc == nil {
			continue
		}
		value, ok := getNestedValueByReflect(reflect.ValueOf(doc), distinctItems)
		if !ok {
			continue
		}
		keyStr := fmt.Sprintf("%v", value)
		if _, exists := distinctKeyMap[keyStr]; !exists {
			distinctKeyMap[keyStr] = i
			uniqueIndices = append(uniqueIndices, i)
		}
	}
	if len(uniqueIndices) == 0 {
		return nil, fmt.Errorf("distinct field '%s' not found in any document", distinctField)
	}
	newDocuments := make([]*T, 0, len(uniqueIndices))
	for _, idx := range uniqueIndices {
		newDocuments = append(newDocuments, documents[idx])
	}
	return newDocuments, nil
}

func getNestedValueByReflect(val reflect.Value, keys []string) (interface{}, bool) {
	for val.Kind() == reflect.Ptr {
		if val.IsNil() {
			return nil, false
		}
		val = val.Elem()
	}
	current := val
	for i, key := range keys {
		if current.Kind() == reflect.Ptr {
			if current.IsNil() {
				return nil, false
			}
			current = current.Elem()
		}
		switch current.Kind() {
		case reflect.Struct:
			field := findFieldByName(current, key)
			if !field.IsValid() {
				return nil, false
			}
			current = field
		case reflect.Map:
			mapVal := current.MapIndex(reflect.ValueOf(key))
			if !mapVal.IsValid() {
				return nil, false
			}
			current = mapVal
		default:
			return nil, false
		}
		if i == len(keys)-1 {
			return current.Interface(), true
		}
	}
	return nil, false
}

func findFieldByName(val reflect.Value, name string) reflect.Value {
	typ := val.Type()
	for i := 0; i < val.NumField(); i++ {
		field := typ.Field(i)
		if strings.EqualFold(field.Name, name) {
			return val.Field(i)
		}
		if jsonTag := field.Tag.Get("json"); jsonTag != "" {
			tagName := strings.Split(jsonTag, ",")[0]
			if tagName == name {
				return val.Field(i)
			}
		}
		if bsonTag := field.Tag.Get("bson"); bsonTag != "" {
			tagName := strings.Split(bsonTag, ",")[0]
			if tagName == name {
				return val.Field(i)
			}
		}
	}
	return reflect.Value{}
}

// InsertDocumentWithID - alias for CreateDocumentTypedWithID
func InsertDocumentWithID[T any](m *MongoDB, ctx context.Context, collection string, id string, userData T) (*TypedDocument[T], error) {
	return CreateDocumentTypedWithID[T](m, ctx, collection, id, userData)
}

// CreateDocumentTypedWithID 使用指定ID创建文档
func CreateDocumentTypedWithID[T any](m *MongoDB, ctx context.Context, collection string, id string, userData T) (*TypedDocument[T], error) {
	if !m.IsEnabled() {
		return nil, fmt.Errorf("mongodb is not enabled")
	}
	doc := &TypedDocument[T]{
		Id:          id,
		MarkDeleted: false,
		CreatedAt:   time.Now().Unix(),
		UpdatedAt:   time.Now().Unix(),
		Resource:    userData,
	}
	_, err := m.db.Collection(collection).InsertOne(ctx, doc)
	if err != nil {
		return nil, fmt.Errorf("insert document with id failed: %w", err)
	}
	return doc, nil
}

// GetDocument - alias for GetDocumentTyped
func GetDocument[T any](m *MongoDB, ctx context.Context, collection string, id string) (*TypedDocument[T], error) {
	return GetDocumentTyped[T](m, ctx, collection, id)
}

// UpdateDocument - alias for UpdateDocumentTyped
func UpdateDocument[T any](m *MongoDB, ctx context.Context, collection string, id string, userData T) (*TypedDocument[T], error) {
	return UpdateDocumentTyped[T](m, ctx, collection, id, userData)
}

// DeleteDocument - alias for DeleteDocumentTyped
func DeleteDocument[T any](m *MongoDB, ctx context.Context, collection string, id string) error {
	return DeleteDocumentTyped[T](m, ctx, collection, id)
}

// ListDocuments - alias for ListDocumentsTyped with filter
func ListDocuments[T any](m *MongoDB, ctx context.Context, collection string, req *QueryRequest, filter interface{}) ([]*TypedDocument[T], int64, error) {
	// Ignore filter for now, use req.Query
	return ListDocumentsTyped[T](m, ctx, collection, req)
}

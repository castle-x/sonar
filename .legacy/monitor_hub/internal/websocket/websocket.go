package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"git.woa.com/castlexu/goutils/ablog"
	"github.com/bytedance/sonic"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/hertz-contrib/websocket"

	baseV1 "monitor_hub/apis/monitor_hub/base/v1"
	configv1 "monitor_hub/config/v1"
	trigger "monitor_hub/internal/trigger"
)

var logger = ablog.NewLogger("websocket")

// ============================================
// Protocol - 协议定义
// ============================================

type Envelope baseV1.WsEnvelope
type WsResponse baseV1.WsResponse
type WsHeartbeat baseV1.WsHeartbeat

type EnvelopeType string

const (
	EnvelopeTypeRequest   EnvelopeType = "request"
	EnvelopeTypeResponse  EnvelopeType = "response"
	EnvelopeTypeBroadcast EnvelopeType = "broadcast"
	EnvelopeTypeHeartbeat EnvelopeType = "heartbeat"
)

const (
	ERR_CODE_INVALID_JSON      = 1000
	ERR_CODE_INVALID_TYPE      = 1001
	ERR_CODE_INVALID_TOPIC     = 1002
	ERR_CODE_INVALID_PATH      = 1003
	ERR_CODE_INVALID_TIMESTAMP = 1004
	ERR_CODE_INVALID_DATA      = 1005
	ERR_CODE_INVALID_REQUEST   = 1006
	ERR_CODE_INVALID_RESPONSE  = 1007
	ERR_CODE_INVALID_HEARTBEAT = 1008
	ERR_CODE_ROUTE_NOT_FOUND   = 404
	ERR_CODE_INTERNAL_ERROR    = 500
)

// ParseEnvelope 解析消息包装器
func ParseEnvelope(data []byte) (*Envelope, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty message")
	}

	var baseEnv baseV1.WsEnvelope
	if err := sonic.Unmarshal(data, &baseEnv); err != nil {
		return nil, fmt.Errorf("invalid JSON format: %w", err)
	}

	env := (*Envelope)(&baseEnv)
	if err := env.Validate(); err != nil {
		return nil, err
	}

	return env, nil
}

// Validate 验证消息包装器
func (e *Envelope) Validate() error {
	if !e.IsValidType() {
		return fmt.Errorf("invalid message type: %s", e.Type)
	}

	if e.RequiresTopic() && e.Topic == "" {
		return fmt.Errorf("topic is required for message type: %s", e.Type)
	}

	if EnvelopeType(e.Type) == EnvelopeTypeRequest && e.Path == "" {
		return fmt.Errorf("path is required for request message")
	}

	if e.Timestamp <= 0 {
		e.Timestamp = time.Now().UnixMilli()
	}

	return nil
}

func (e *Envelope) IsValidType() bool {
	envelopeType := EnvelopeType(e.Type)
	switch envelopeType {
	case EnvelopeTypeRequest, EnvelopeTypeResponse, EnvelopeTypeBroadcast, EnvelopeTypeHeartbeat:
		return true
	default:
		return false
	}
}

func (e *Envelope) RequiresTopic() bool {
	envelopeType := EnvelopeType(e.Type)
	switch envelopeType {
	case EnvelopeTypeRequest, EnvelopeTypeBroadcast:
		return true
	default:
		return false
	}
}

// WrapEnvelope 封装消息
func WrapEnvelope(envelopeType EnvelopeType, topic string, data any) ([]byte, error) {
	var dataJSON json.RawMessage
	if data != nil {
		jsonData, err := sonic.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("marshal data failed: %w", err)
		}
		dataJSON = jsonData
	}

	baseEnv := baseV1.WsEnvelope{
		Type:      string(envelopeType),
		Topic:     topic,
		Data:      dataJSON,
		Timestamp: time.Now().UnixMilli(),
	}

	result, err := sonic.Marshal(baseEnv)
	if err != nil {
		return nil, fmt.Errorf("marshal envelope failed: %w", err)
	}

	return result, nil
}

func WrapResponse(code int32, message string, data any) ([]byte, error) {
	return WrapEnvelope(EnvelopeTypeResponse, "", &baseV1.WsResponse{
		Code:    code,
		Message: message,
		Data:    data,
	})
}

// WrapResponseWithEnvelope 封装完整响应消息
func WrapResponseWithEnvelope(requestEnv *Envelope, resp *WsResponse) ([]byte, error) {
	respData, err := sonic.Marshal(resp)
	if err != nil {
		return nil, fmt.Errorf("marshal WsResponseData failed: %w", err)
	}
	responseEnv := &Envelope{
		Type:      string(EnvelopeTypeResponse),
		Data:      respData,
		Timestamp: time.Now().UnixMilli(),
	}
	if requestEnv != nil {
		responseEnv.Topic = requestEnv.Topic
		responseEnv.Path = requestEnv.Path
		responseEnv.RequestId = requestEnv.RequestId
	}

	result, err := sonic.Marshal(responseEnv)
	if err != nil {
		return nil, fmt.Errorf("marshal response envelope failed: %w", err)
	}

	return result, nil
}

// WrapPong 封装心跳响应
func WrapPong(clientTimestamp int64) ([]byte, error) {
	heartbeat := baseV1.WsHeartbeat{
		ClientTime: clientTimestamp,
		ServerTime: time.Now().UnixMilli(),
	}

	return WrapEnvelope(EnvelopeTypeHeartbeat, "", heartbeat)
}

// UnmarshalData 解析业务数据
func (e *Envelope) UnmarshalData(v any) error {
	if e.Data == nil {
		return fmt.Errorf("no data to unmarshal")
	}

	if err := sonic.Unmarshal(e.Data, v); err != nil {
		return fmt.Errorf("unmarshal data failed: %w", err)
	}

	return nil
}

func (e *Envelope) String() string {
	parts := []string{fmt.Sprintf("type=%s", e.Type)}

	if e.Topic != "" {
		parts = append(parts, fmt.Sprintf("topic=%s", e.Topic))
	}

	if e.Path != "" {
		parts = append(parts, fmt.Sprintf("path=%s", e.Path))
	}

	if e.RequestId != "" {
		parts = append(parts, fmt.Sprintf("request_id=%s", e.RequestId))
	}

	parts = append(parts, fmt.Sprintf("timestamp=%d", e.Timestamp))

	return fmt.Sprintf("Envelope{%s}", strings.Join(parts, ", "))
}

type WsOpt func(*WsResponse)

func WithWsData(data any) WsOpt {
	return func(resp *WsResponse) {
		jsonData, err := sonic.Marshal(data)
		if err != nil {
			return
		}
		resp.Data = jsonData
	}
}

func WsSuccess(opts ...WsOpt) *WsResponse {
	resp := &WsResponse{
		Code:    0,
		Message: "success",
	}
	for _, opt := range opts {
		opt(resp)
	}
	return resp
}

func WsFailed(err error, errorCode int32) *WsResponse {
	return &WsResponse{
		Code:    errorCode,
		Message: err.Error(),
	}
}

// ============================================
// Connection - 连接管理
// ============================================

type ConnectionConfig struct {
	SendChannelSize int
	MaxMessageSize  int
	PongWait        int
	WriteWait       int
	PingPeriod      int
}

// Connection WebSocket 连接
type Connection struct {
	ID       string
	UserID   string
	Conn     *websocket.Conn
	Metadata map[string]interface{}

	hub    *Hub
	send   chan []byte
	ctx    context.Context
	cancel context.CancelFunc

	mu       sync.RWMutex
	isClosed bool
	closeMu  sync.Mutex

	cfg *ConnectionConfig
}

// NewConnection 创建连接
func NewConnection(conn *websocket.Conn, hub *Hub, connID string, cfg *ConnectionConfig) *Connection {
	if connID == "" {
		connID = generateConnID()
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Connection{
		ID:       connID,
		Conn:     conn,
		Metadata: make(map[string]interface{}),
		hub:      hub,
		send:     make(chan []byte, cfg.SendChannelSize),
		ctx:      ctx,
		cancel:   cancel,
		isClosed: false,
		cfg:      cfg,
	}
}

// SendResponseWithEnvelope 发送响应消息
func (c *Connection) SendResponseWithEnvelope(requestEnv *Envelope, resp *WsResponse) error {
	payload, err := WrapResponseWithEnvelope(requestEnv, resp)
	if err != nil {
		return fmt.Errorf("wrap response with envelope failed: %w", err)
	}

	return c.Send(payload)
}

// SendPush 发送推送消息
func (c *Connection) SendPush(topic string, data any) error {
	payload, err := WrapEnvelope(EnvelopeTypeBroadcast, topic, data)
	if err != nil {
		return fmt.Errorf("wrap push failed: %w", err)
	}

	return c.Send(payload)
}

// SendPong 发送心跳响应
func (c *Connection) SendPong(clientTimestamp int64) error {
	data, err := WrapPong(clientTimestamp)
	if err != nil {
		return fmt.Errorf("wrap pong failed: %w", err)
	}

	return c.Send(data)
}

// Send 发送原始数据
func (c *Connection) Send(data []byte) error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	if c.isClosed {
		return fmt.Errorf("connection is closed")
	}

	select {
	case c.send <- data:
		return nil
	case <-c.ctx.Done():
		return fmt.Errorf("connection context canceled")
	default:
		logger.Warn("(Connection: %s) send queue is full, dropping message", c.ID)
		return fmt.Errorf("send queue is full")
	}
}

// ReadPump 读取消息循环
func (c *Connection) ReadPump() {
	defer func() {
		c.Close()
		if c.hub != nil {
			c.hub.Unregister(c)
		}
	}()

	c.Conn.SetReadLimit(int64(c.cfg.MaxMessageSize))
	c.Conn.SetReadDeadline(time.Now().Add(time.Duration(c.cfg.PongWait) * time.Second))

	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(time.Duration(c.cfg.PongWait) * time.Second))
		return nil
	})

	for {
		select {
		case <-c.ctx.Done():
			logger.Info("(Connection: %s) context canceled, stopping ReadPump", c.ID)
			return
		default:
		}

		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Warn("(Connection: %s) unexpected close error: (%v)", c.ID, err)
			} else {
				logger.Info("(Connection: %s) connection closed: (%v)", c.ID, err)
			}
			return
		}

		env, err := ParseEnvelope(message)
		if err != nil {
			logger.Warn("(Connection: %s) parse message failed: (%v)", c.ID, err)
			c.SendResponseWithEnvelope(nil, WsFailed(err, ERR_CODE_INVALID_JSON))
			continue
		}

		if c.hub != nil {
			if err := c.hub.RouteEnvelope(c.ctx, c, env); err != nil {
				logger.Warn("(Connection: %s) route message failed: (%v)", c.ID, err)
				c.SendResponseWithEnvelope(env, WsFailed(err, ERR_CODE_INTERNAL_ERROR))
				continue
			}
		} else {
			logger.Warn("(Connection: %s) no hub to route message, ignoring", c.ID)
		}
	}
}

// WritePump 写入消息循环
func (c *Connection) WritePump() {
	ticker := time.NewTicker(time.Duration(c.cfg.PingPeriod) * time.Second)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.Conn.SetWriteDeadline(time.Now().Add(time.Duration(c.cfg.WriteWait) * time.Second))

			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				logger.Warn("(Connection: %s) write message failed: (%v)", c.ID, err)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(time.Duration(c.cfg.WriteWait) * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				logger.Warn("(Connection: %s) write ping failed: (%v)", c.ID, err)
				return
			}

		case <-c.ctx.Done():
			logger.Info("(Connection: %s) context canceled, stopping WritePump", c.ID)
			return
		}
	}
}

// Metadata 方法
func (c *Connection) SetMetadata(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Metadata[key] = value
}

func (c *Connection) GetMetadata(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	val, ok := c.Metadata[key]
	return val, ok
}

func (c *Connection) DeleteMetadata(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.Metadata, key)
}

// Close 关闭连接
func (c *Connection) Close() error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	if c.isClosed {
		return nil
	}

	c.isClosed = true
	c.cancel()
	close(c.send)

	if c.Conn != nil {
		if err := c.Conn.Close(); err != nil {
			logger.Warn("(Connection: %s) close websocket failed: (%v)", c.ID, err)
			return err
		}
	}

	logger.Info("(Connection: %s) connection closed", c.ID)
	return nil
}

func (c *Connection) IsClosed() bool {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	return c.isClosed
}

func (c *Connection) Context() context.Context {
	return c.ctx
}

func generateConnID() string {
	return fmt.Sprintf("conn-%d", time.Now().UnixNano())
}

// ============================================
// Router - 路由管理
// ============================================

type Handler interface {
	Handle(ctx context.Context, conn *Connection, env *Envelope) *WsResponse
}

type HandlerFunc func(ctx context.Context, conn *Connection, env *Envelope) *WsResponse

func (f HandlerFunc) Handle(ctx context.Context, conn *Connection, env *Envelope) *WsResponse {
	return f(ctx, conn, env)
}

// Router 路由器
type Router struct {
	handlers        map[string]Handler
	mu              sync.RWMutex
	notFoundHandler Handler
	errorHandler    Handler
}

func NewRouter() *Router {
	return &Router{
		handlers: make(map[string]Handler),
	}
}

// Handle 注册处理器
func (r *Router) Handle(routeKey string, handler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if routeKey == "" {
		logger.Warn("(Router) Cannot register handler with empty routeKey")
		return
	}

	if handler == nil {
		logger.Warn("(Router) Cannot register nil handler for routeKey (%s)", routeKey)
		return
	}
	if _, exists := r.handlers[routeKey]; exists {
		logger.Warn("(Router) Handler for routeKey (%s) already exists", routeKey)
		return
	}
	r.handlers[routeKey] = handler
	logger.Info("(Router) Registered handler for routeKey (%s)", routeKey)
}

func (r *Router) HandleFunc(routeKey string, handlerFunc func(ctx context.Context, conn *Connection, env *Envelope) *WsResponse) {
	r.Handle(routeKey, HandlerFunc(handlerFunc))
}

func (r *Router) Unregister(routeKey string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.handlers, routeKey)
	logger.Info("(Router) Unregistered handler for routeKey (%s)", routeKey)
}

func (r *Router) SetNotFoundHandler(handler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.notFoundHandler = handler
	logger.Info("(Router) Set not found handler")
}

func (r *Router) SetErrorHandler(errorHandler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.errorHandler = errorHandler
	logger.Info("(Router) Set error handler")
}

// Route 路由消息
func (r *Router) Route(ctx context.Context, conn *Connection, env *Envelope) error {
	envelopeType := EnvelopeType(env.Type)
	var routeKey string
	switch envelopeType {
	case EnvelopeTypeHeartbeat:
		return r.handleHeartbeat(conn, env)
	case EnvelopeTypeRequest:
		routeKey = env.Topic + env.Path
	default:
		logger.Warn("(Router) Unknown message type (%s) on connection (%s)", env.Type, conn.ID)
		return conn.SendResponseWithEnvelope(env, WsFailed(fmt.Errorf("未知的消息类型"), ERR_CODE_INVALID_TYPE))
	}

	r.mu.RLock()
	handler, exists := r.handlers[routeKey]
	notFoundHandler := r.notFoundHandler
	errorHandler := r.errorHandler
	r.mu.RUnlock()

	if !exists {
		logger.Warn("(Router) No handler found for route (%s) (type=%s, topic=%s, path=%s) on connection (%s)",
			routeKey, env.Type, env.Topic, env.Path, conn.ID)

		if notFoundHandler != nil {
			return conn.SendResponseWithEnvelope(env, notFoundHandler.Handle(ctx, conn, env))
		}

		return conn.SendResponseWithEnvelope(env, WsFailed(fmt.Errorf("未找到处理器"), ERR_CODE_ROUTE_NOT_FOUND))
	}

	logger.Info("(Router) Routing message to handler for route (%s) on connection (%s)", routeKey, conn.ID)

	resp := handler.Handle(ctx, conn, env)
	if resp.Code != 0 {
		logger.Warn("(Router) Handler error for route (%s) on connection (%s): (%v)", routeKey, conn.ID, resp.Message)

		if errorHandler != nil {
			return conn.SendResponseWithEnvelope(env, errorHandler.Handle(ctx, conn, env))
		}
		return conn.SendResponseWithEnvelope(env, resp)
	}

	return conn.SendResponseWithEnvelope(env, resp)
}

// handleHeartbeat 处理心跳
func (r *Router) handleHeartbeat(conn *Connection, env *Envelope) error {
	var clientTime int64

	if len(env.Data) > 0 {
		var heartbeatData struct {
			ClientTime int64 `json:"client_time"`
			ServerTime int64 `json:"server_time"`
		}
		if err := env.UnmarshalData(&heartbeatData); err == nil && heartbeatData.ClientTime > 0 {
			clientTime = heartbeatData.ClientTime
		} else {
			logger.Warn("(Router) Failed to parse heartbeat data on connection (%s): (%v)", conn.ID, err)
			clientTime = env.Timestamp
		}
	} else {
		clientTime = env.Timestamp
	}

	return conn.SendPong(clientTime)
}

// 查询方法
func (r *Router) GetHandler(topic string) (Handler, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	handler, exists := r.handlers[topic]
	return handler, exists
}

func (r *Router) HasHandler(topic string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	_, exists := r.handlers[topic]
	return exists
}

func (r *Router) GetTopics() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	topics := make([]string, 0, len(r.handlers))
	for topic := range r.handlers {
		topics = append(topics, topic)
	}

	return topics
}

func (r *Router) GetHandlerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.handlers)
}

// ============================================
// Subscription - 订阅管理
// ============================================

// Subscription 订阅信息
type Subscription struct {
	ConnID   string
	Topic    string
	Metadata any
}

// SubscriptionManager 订阅管理器
type SubscriptionManager struct {
	topicSubs map[string]map[string]*Subscription // topic -> {connID -> Subscription}
	connSubs  map[string]map[string]*Subscription // connID -> {topic -> Subscription}
	mu        sync.RWMutex
}

func NewSubscriptionManager() *SubscriptionManager {
	return &SubscriptionManager{
		topicSubs: make(map[string]map[string]*Subscription),
		connSubs:  make(map[string]map[string]*Subscription),
	}
}

// Subscribe 订阅主题
func (sm *SubscriptionManager) Subscribe(connID, topic string, metadata any) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sub := &Subscription{
		ConnID:   connID,
		Topic:    topic,
		Metadata: metadata,
	}

	if sm.topicSubs[topic] == nil {
		sm.topicSubs[topic] = make(map[string]*Subscription)
	}
	sm.topicSubs[topic][connID] = sub

	if sm.connSubs[connID] == nil {
		sm.connSubs[connID] = make(map[string]*Subscription)
	}
	sm.connSubs[connID][topic] = sub

	logger.Info("(SubscriptionManager) Connection (%s) subscribed to topic (%s)", connID, topic)
}

// Unsubscribe 取消订阅
func (sm *SubscriptionManager) Unsubscribe(connID, topic string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.connSubs[connID] == nil || sm.connSubs[connID][topic] == nil {
		logger.Warn("(SubscriptionManager) Connection (%s) not subscribed to topic (%s)", connID, topic)
		return false
	}

	if sm.topicSubs[topic] != nil {
		delete(sm.topicSubs[topic], connID)

		if len(sm.topicSubs[topic]) == 0 {
			delete(sm.topicSubs, topic)
		}
	}

	delete(sm.connSubs[connID], topic)

	if len(sm.connSubs[connID]) == 0 {
		delete(sm.connSubs, connID)
	}

	logger.Info("(SubscriptionManager) Connection (%s) unsubscribed from topic (%s)", connID, topic)
	return true
}

// UnsubscribeAll 取消所有订阅
func (sm *SubscriptionManager) UnsubscribeAll(connID string) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	topics := sm.connSubs[connID]
	if topics == nil {
		return 0
	}

	count := len(topics)

	for topic := range topics {
		if sm.topicSubs[topic] != nil {
			delete(sm.topicSubs[topic], connID)

			if len(sm.topicSubs[topic]) == 0 {
				delete(sm.topicSubs, topic)
			}
		}
	}

	delete(sm.connSubs, connID)

	logger.Info("(SubscriptionManager) Connection (%s) unsubscribed from all topics (count: %d)", connID, count)
	return count
}

// 查询方法
func (sm *SubscriptionManager) GetConnIDsByTopic(topic string) []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	subs := sm.topicSubs[topic]
	if subs == nil {
		return nil
	}

	connIDs := make([]string, 0, len(subs))
	for connID := range subs {
		connIDs = append(connIDs, connID)
	}

	return connIDs
}

func (sm *SubscriptionManager) GetTopicsByConnID(connID string) []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	subs := sm.connSubs[connID]
	if subs == nil {
		return nil
	}

	topics := make([]string, 0, len(subs))
	for topic := range subs {
		topics = append(topics, topic)
	}

	return topics
}

func (sm *SubscriptionManager) GetSubscriptionByConnIDAndTopic(connID, topic string) (*Subscription, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if sm.connSubs[connID] == nil {
		return nil, false
	}

	sub, exists := sm.connSubs[connID][topic]
	return sub, exists
}

func (sm *SubscriptionManager) IsSubscribed(connID, topic string) bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if sm.connSubs[connID] == nil {
		return false
	}

	_, exists := sm.connSubs[connID][topic]
	return exists
}

func (sm *SubscriptionManager) GetSubscriptionsByConnID(connID string) []*Subscription {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	subs := sm.connSubs[connID]
	if subs == nil {
		return nil
	}

	subscriptions := make([]*Subscription, 0, len(subs))
	for _, sub := range subs {
		subscriptions = append(subscriptions, sub)
	}

	return subscriptions
}

func (sm *SubscriptionManager) GetSubscriptionsByTopic(topic string) []*Subscription {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	subs := sm.topicSubs[topic]
	if subs == nil {
		return nil
	}
	subscriptions := make([]*Subscription, 0, len(subs))
	for _, sub := range subs {
		subscriptions = append(subscriptions, sub)
	}
	return subscriptions
}

// 统计方法
func (sm *SubscriptionManager) GetTopicCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	return len(sm.topicSubs)
}

func (sm *SubscriptionManager) GetSubscriberCount(topic string) int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	subs := sm.topicSubs[topic]
	if subs == nil {
		return 0
	}

	return len(subs)
}

func (sm *SubscriptionManager) GetTopics() []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	topics := make([]string, 0, len(sm.topicSubs))
	for topic := range sm.topicSubs {
		topics = append(topics, topic)
	}

	return topics
}

func (sm *SubscriptionManager) GetStats() map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	totalSubs := 0
	for _, subs := range sm.topicSubs {
		totalSubs += len(subs)
	}

	return map[string]interface{}{
		"topic_count":         len(sm.topicSubs),
		"connection_count":    len(sm.connSubs),
		"total_subscriptions": totalSubs,
	}
}

// ============================================
// Hub - 连接池管理
// ============================================

type HubConfig struct {
	RegisterChannelSize   int
	UnregisterChannelSize int
	BroadcastChannelSize  int
}

// BroadcastMessage 广播消息
type BroadcastMessage struct {
	Topic  string
	Data   interface{}
	Filter func(*Connection) bool
}

// Hub 连接池
type Hub struct {
	connections     map[string]*Connection
	userConnections map[string][]string
	register        chan *Connection
	unregister      chan *Connection
	broadcast       chan *BroadcastMessage
	router          *Router
	mu              sync.RWMutex
	ctx             context.Context
	cancel          context.CancelFunc
}

func NewHub(ctx context.Context, router *Router, cfg *HubConfig) *Hub {
	cctx, cancel := context.WithCancel(ctx)
	return &Hub{
		connections:     make(map[string]*Connection),
		userConnections: make(map[string][]string),
		register:        make(chan *Connection, cfg.RegisterChannelSize),
		unregister:      make(chan *Connection, cfg.UnregisterChannelSize),
		broadcast:       make(chan *BroadcastMessage, cfg.BroadcastChannelSize),
		router:          router,
		ctx:             cctx,
		cancel:          cancel,
	}
}

// Run Hub 事件循环
func (h *Hub) Run() {
	logger.Info("(Hub) Starting Hub event loop")

	for {
		select {
		case conn := <-h.register:
			h.handleRegister(conn)

		case conn := <-h.unregister:
			h.handleUnregister(conn)

		case msg := <-h.broadcast:
			h.handleBroadcast(msg)

		case <-h.ctx.Done():
			logger.Info("(Hub) Context canceled, stopping Hub")
			h.cleanup()
			return
		}
	}
}

func (h *Hub) Stop() {
	logger.Info("(Hub) Stopping Hub")
	h.cancel()
}

// 连接管理
func (h *Hub) Register(conn *Connection) {
	select {
	case h.register <- conn:
	case <-h.ctx.Done():
		logger.Warn("(Hub) Cannot register connection (%s): Hub is stopped", conn.ID)
	}
}

func (h *Hub) Unregister(conn *Connection) {
	select {
	case h.unregister <- conn:
	case <-h.ctx.Done():
	}
}

func (h *Hub) handleRegister(conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.connections[conn.ID] = conn

	if conn.UserID != "" {
		h.addToUserMapping(conn.ID, conn.UserID)
		logger.Info("(Hub) Registered connection (%s) for user (%s) (total: %d connections for this user)",
			conn.ID, conn.UserID, len(h.userConnections[conn.UserID]))
	} else {
		logger.Info("(Hub) Registered connection (%s) (no user)", conn.ID)
	}

	logger.Info("(Hub) Total connections: (%d)", len(h.connections))
}

func (h *Hub) handleUnregister(conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.connections, conn.ID)

	if conn.UserID != "" {
		h.removeFromUserMapping(conn.ID, conn.UserID)
		logger.Info("(Hub) Unregistered connection (%s) for user (%s)", conn.ID, conn.UserID)
	} else {
		logger.Info("(Hub) Unregistered connection (%s)", conn.ID)
	}

	logger.Info("(Hub) Total connections: (%d)", len(h.connections))
}

// 广播
func (h *Hub) BroadcastToTopic(topic string, data interface{}) {
	h.Broadcast(topic, data, nil)
}

func (h *Hub) Broadcast(topic string, data interface{}, filter func(*Connection) bool) {
	select {
	case h.broadcast <- &BroadcastMessage{
		Topic:  topic,
		Data:   data,
		Filter: filter,
	}:
	case <-h.ctx.Done():
		logger.Warn("(Hub) Cannot broadcast to topic (%s): Hub is stopped", topic)
	default:
		logger.Warn("(Hub) Broadcast queue full, dropping message for topic (%s)", topic)
	}
}

func (h *Hub) handleBroadcast(msg *BroadcastMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	sent := 0
	failed := 0

	for _, conn := range h.connections {
		if msg.Filter != nil && !msg.Filter(conn) {
			continue
		}

		if err := conn.SendPush(msg.Topic, msg.Data); err != nil {
			logger.Warn("(Hub) Broadcast to connection (%s) failed: (%v)", conn.ID, err)
			failed++
		} else {
			sent++
		}
	}

	logger.Info("(Hub) Broadcast to topic (%s): sent=%d, failed=%d", msg.Topic, sent, failed)
}

// 用户管理
func (h *Hub) SetUserID(conn *Connection, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.connections[conn.ID]; !exists {
		logger.Warn("(Hub) Cannot set UserID for unregistered connection (%s)", conn.ID)
		return
	}

	oldUserID := conn.UserID

	if oldUserID != "" {
		h.removeFromUserMapping(conn.ID, oldUserID)
	}

	conn.UserID = userID

	if userID != "" {
		h.addToUserMapping(conn.ID, userID)

		if oldUserID != "" {
			logger.Info("(Hub) Connection (%s) changed user from (%s) to (%s)", conn.ID, oldUserID, userID)
		} else {
			logger.Info("(Hub) Connection (%s) authenticated as user (%s) (total: %d connections for this user)",
				conn.ID, userID, len(h.userConnections[userID]))
		}
	} else {
		if oldUserID != "" {
			logger.Info("(Hub) Connection (%s) logged out from user (%s)", conn.ID, oldUserID)
		}
	}
}

func (h *Hub) addToUserMapping(connID, userID string) {
	h.userConnections[userID] = append(h.userConnections[userID], connID)
}

func (h *Hub) removeFromUserMapping(connID, userID string) {
	connIDs := h.userConnections[userID]
	for i, id := range connIDs {
		if id == connID {
			h.userConnections[userID] = append(connIDs[:i], connIDs[i+1:]...)
			break
		}
	}

	if len(h.userConnections[userID]) == 0 {
		delete(h.userConnections, userID)
	}
}

// 查询方法
func (h *Hub) GetConnection(connID string) (*Connection, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	conn, ok := h.connections[connID]
	return conn, ok
}

func (h *Hub) GetConnectionsByUser(userID string) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	connIDs, ok := h.userConnections[userID]
	if !ok {
		return nil
	}

	conns := make([]*Connection, 0, len(connIDs))
	for _, id := range connIDs {
		if conn, ok := h.connections[id]; ok {
			conns = append(conns, conn)
		}
	}

	return conns
}

func (h *Hub) GetConnIDsByUser(userID string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	connIDs, ok := h.userConnections[userID]
	if !ok {
		return nil
	}

	ids := make([]string, 0, len(connIDs))
	ids = append(ids, connIDs...)

	return ids
}

func (h *Hub) GetAllConnections() []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	conns := make([]*Connection, 0, len(h.connections))
	for _, conn := range h.connections {
		conns = append(conns, conn)
	}

	return conns
}

func (h *Hub) GetConnectionCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.connections)
}

func (h *Hub) GetUserCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.userConnections)
}

// 路由
func (h *Hub) RouteEnvelope(ctx context.Context, conn *Connection, env *Envelope) error {
	if h.router == nil {
		return fmt.Errorf("no router configured")
	}

	return h.router.Route(ctx, conn, env)
}

func (h *Hub) cleanup() {
	h.mu.Lock()
	defer h.mu.Unlock()

	logger.Info("(Hub) Cleaning up (%d) connections", len(h.connections))

	for _, conn := range h.connections {
		conn.cancel()
	}

	h.connections = make(map[string]*Connection)
	h.userConnections = make(map[string][]string)
}

// ============================================
// Broadcast - 广播管理
// ============================================

type BroadcastOpt func(option *BroadcastOption)

type BroadcastOption struct {
	Method          string `json:"method" yaml:"method"`
	Topic           string `json:"topic" yaml:"topic"`
	TriggerType     string `json:"trigger_type" yaml:"trigger_type"`
	Interval        string `json:"interval" yaml:"interval"`
	Cron            string `json:"cron" yaml:"cron"`
	OnceDelay       string `json:"once_delay" yaml:"once_delay"`
	EventName       string `json:"event_name" yaml:"event_name"`
	EventBufferSize int    `json:"event_buffer_size" yaml:"event_buffer_size"` // 事件缓冲区大小
}

func NewBroadcastOptions[T any](src []T) []BroadcastOption {
	data, err := sonic.Marshal(src)
	if err != nil {
		return nil
	}
	var dst []BroadcastOption
	if err := sonic.Unmarshal(data, &dst); err != nil {
		return nil
	}
	return dst
}

func WithOptionMethod(method string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.Method = method
	}
}

func WithOptionTopic(topic string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.Topic = topic
	}
}

func WithOptionTriggerType(triggerType string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.TriggerType = triggerType
	}
}

func WithOptionInterval(interval string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.Interval = interval
	}
}

func WithOptionCron(cron string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.Cron = cron
	}
}

func WithOptionOnceDelay(onceDelay string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.OnceDelay = onceDelay
	}
}

func WithOptionEventName(eventName string) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.EventName = eventName
	}
}

func WithOptionEventBufferSize(eventBufferSize int) BroadcastOpt {
	return func(option *BroadcastOption) {
		option.EventBufferSize = eventBufferSize
	}
}

func NewBroadcastOption(opts ...BroadcastOpt) *BroadcastOption {
	option := &BroadcastOption{}
	for _, opt := range opts {
		opt(option)
	}
	return option
}

// BroadcastContext 广播上下文
//
// 封装广播所需的所有上下文信息，同时实现 context.Context 接口
type BroadcastContext struct {
	context.Context                        // 嵌入 context.Context，继承其所有方法
	subscription    *Subscription          // 订阅信息（BroadcastOne 使用）
	topic           string                 // 主题（BroadcastRange 使用）
	event           interface{}            // 事件数据（可选，nil 表示定时触发）
	triggerType     string                 // 触发类型："interval"、"event"、"manual" 等
	metadata        map[string]interface{} // 额外元数据（未来扩展用）
}

// NewBroadcastContext 创建广播上下文
func NewBroadcastContext(ctx context.Context, subscription *Subscription, topic string, event interface{}, triggerType string) *BroadcastContext {
	return &BroadcastContext{
		Context:      ctx,
		subscription: subscription,
		topic:        topic,
		event:        event,
		triggerType:  triggerType,
	}
}

// Subscription 获取订阅信息
func (bctx *BroadcastContext) Subscription() *Subscription {
	return bctx.subscription
}

// Topic 获取主题
func (bctx *BroadcastContext) Topic() string {
	return bctx.topic
}

// Event 获取事件数据
func (bctx *BroadcastContext) Event() interface{} {
	return bctx.event
}

// TriggerType 获取触发类型
func (bctx *BroadcastContext) TriggerType() string {
	return bctx.triggerType
}

// GetMetadata 获取元数据
func (bctx *BroadcastContext) GetMetadata(key string) (interface{}, bool) {
	if bctx.metadata == nil {
		return nil, false
	}
	val, ok := bctx.metadata[key]
	return val, ok
}

// SetMetadata 设置元数据
func (bctx *BroadcastContext) SetMetadata(key string, value interface{}) {
	if bctx.metadata == nil {
		bctx.metadata = make(map[string]interface{})
	}
	bctx.metadata[key] = value
}

// IsEventTrigger 判断是否为事件触发
func (bctx *BroadcastContext) IsEventTrigger() bool {
	return bctx.triggerType == "event" && bctx.event != nil
}

// IsIntervalTrigger 判断是否为定时触发
func (bctx *BroadcastContext) IsIntervalTrigger() bool {
	return bctx.triggerType == "interval"
}

// IsManualTrigger 判断是否为手动触发
func (bctx *BroadcastContext) IsManualTrigger() bool {
	return bctx.triggerType == "manual"
}

// Broadcaster 广播器接口
type Broadcaster interface {
	Name() string
	Options() []BroadcastOption
	BroadcastOne(bctx *BroadcastContext) *BroadcasterMessage
	BroadcastRange(bctx *BroadcastContext) *BroadcasterMessage
}

// Manager 广播管理器
type Manager struct {
	cfg            *configv1.Config
	wsServer       *Server
	broadcasters   []Broadcaster
	ctx            context.Context
	cancel         context.CancelFunc
	triggerMap     map[string]trigger.Trigger
	triggerManager *trigger.TriggerManager
}

func NewManager(ctx context.Context, cfg *configv1.Config, triggerManager *trigger.TriggerManager) *Manager {
	ctx, cancel := context.WithCancel(ctx)
	wsServer := NewServer(cfg)
	return &Manager{
		cfg:            cfg,
		wsServer:       wsServer,
		broadcasters:   make([]Broadcaster, 0),
		ctx:            ctx,
		cancel:         cancel,
		triggerMap:     make(map[string]trigger.Trigger),
		triggerManager: triggerManager,
	}
}

// RegisterBroadcasters 注册广播器
func (m *Manager) RegisterBroadcasters(broadcasters ...Broadcaster) {
	m.broadcasters = append(m.broadcasters, broadcasters...)
	for _, broadcaster := range broadcasters {
		options := broadcaster.Options()
		if len(options) == 0 {
			logger.Warn("(%s) no options, skip registering , please check config.yaml", broadcaster.Name())
			continue
		}
		for _, option := range options {
			topic := option.Topic
			if _, ok := m.triggerMap[topic]; ok {
				logger.Error("(%s) topic already registered!!!!", topic)
				continue
			}
			triggerType := option.TriggerType
			if trigger.TriggerType(triggerType) == trigger.TriggerTypeInterval {
				intervalDuration, err := time.ParseDuration(option.Interval)
				if err != nil {
					logger.Error("(%s) failed to parse trigger interval: (%s)", topic, option.Interval)
					continue
				}
				m.triggerMap[topic] = NewBroadcastIntervalTrigger(intervalDuration, topic)
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeEvent {
				// 创建事件触发器，默认缓冲区大小为 100
				m.triggerMap[topic] = NewBroadcastEventTrigger(topic, option.EventBufferSize)
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeCron {
				// TODO: cron trigger
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeOnce {
				// TODO: once trigger
			} else {
				logger.Warn("(%s) Unsupported trigger type: (%s)", topic, triggerType)
			}
		}
	}
}

// StartBroadcasters 启动广播器
func (m *Manager) StartBroadcasters() {
	if !m.cfg.Websocket.Enable {
		logger.Warn("WebSocket is not enabled, skip starting broadcasters ...")
		return
	}
	logger.Info("(Broadcast) Starting broadcast manager with (%d) broadcasters", len(m.broadcasters))

	for _, broadcaster := range m.broadcasters {
		logger.Info("(Broadcast) Starting broadcaster: (%s) with (%d) options", broadcaster.Name(), len(broadcaster.Options()))
		for _, option := range broadcaster.Options() {
			topic := option.Topic
			triggerType := option.TriggerType
			if _, ok := m.triggerMap[topic]; !ok {
				logger.Error("(%s) trigger not registered for topic: (%s)", broadcaster.Name(), topic)
				continue
			}
			t := m.triggerMap[topic]
			if trigger.TriggerType(triggerType) == trigger.TriggerTypeInterval {
				intervalTrigger := m.triggerMap[topic].(*BroadcastIntervalTrigger)
				intervalTrigger.SetTask(func(ctx context.Context) error {
					if !m.ShouldBroadcast(broadcaster, topic) {
						return nil
					}
					// 定时触发：创建 BroadcastContext
					for _, subscription := range m.wsServer.GetSubscriptionManager().GetSubscriptionsByTopic(topic) {
						bctx := NewBroadcastContext(ctx, subscription, topic, nil, "interval")
						go m.wsServer.BroadcastOne(bctx, broadcaster)
					}
					bctx := NewBroadcastContext(ctx, nil, topic, nil, "interval")
					go m.wsServer.BroadcastRange(bctx, broadcaster)
					return nil
				})
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeEvent {
				eventTrigger := m.triggerMap[topic].(*BroadcastEventTrigger)
				eventTrigger.SetTask(func(ctx context.Context, event interface{}) error {
					if !m.ShouldBroadcast(broadcaster, topic) {
						return nil
					}
					// 事件触发：创建带事件数据的 BroadcastContext
					for _, subscription := range m.wsServer.GetSubscriptionManager().GetSubscriptionsByTopic(topic) {
						bctx := NewBroadcastContext(ctx, subscription, topic, event, "event")
						go m.wsServer.BroadcastOne(bctx, broadcaster)
					}
					bctx := NewBroadcastContext(ctx, nil, topic, event, "event")
					go m.wsServer.BroadcastRange(bctx, broadcaster)
					return nil
				})
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeCron {
				// TODO: cron trigger
			} else if trigger.TriggerType(triggerType) == trigger.TriggerTypeOnce {
				// TODO: once trigger
			} else {
				logger.Warn("(%s) Unsupported trigger type: (%s)", topic, triggerType)
			}
			m.triggerManager.Register(t)
		}
	}
}

func (m *Manager) StopBroadcasters() {
	logger.Info("Stopping broadcast manager")
	m.cancel()
}

func (m *Manager) GetWSServer() *Server {
	return m.wsServer
}

func (m *Manager) StartServer() {
	if m.cfg.Websocket.Enable {
		go m.wsServer.Start()
	} else {
		logger.Info("(WebSocket) Server is not enabled")
	}
}

func (m *Manager) StopServer() {
	m.wsServer.Stop()
}

func (m *Manager) ShouldBroadcast(broadcaster Broadcaster, topic string) bool {
	subscriptionManager := m.wsServer.GetSubscriptionManager()
	subscribers := subscriptionManager.GetConnIDsByTopic(topic)
	if len(subscribers) == 0 {
		// logger.Debug("(%s) No subscribers, skip broadcasting", topic)
		return false
	}
	// logger.Debug("(%s) Found (%d) subscribers, start broadcasting", topic, len(subscribers))
	return true
}

// GetEventTrigger 获取指定 topic 的事件触发器
//
// 参数:
//   - topic: 主题名称
//
// 返回:
//   - *BroadcastEventTrigger: 事件触发器实例，如果不存在或类型不匹配则返回 nil
func (m *Manager) GetEventTrigger(topic string) *BroadcastEventTrigger {
	if t, ok := m.triggerMap[topic]; ok {
		if eventTrigger, ok := t.(*BroadcastEventTrigger); ok {
			return eventTrigger
		}
	}
	return nil
}

// PublishEvent 发布事件到指定 topic（便捷方法）
//
// 参数:
//   - topic: 主题名称
//   - event: 事件数据
//
// 返回:
//   - error: 错误信息
func (m *Manager) PublishEvent(topic string, event interface{}) error {
	eventTrigger := m.GetEventTrigger(topic)
	if eventTrigger == nil {
		return fmt.Errorf("event trigger not found for topic: %s", topic)
	}
	if !eventTrigger.PublishEvent(event) {
		return fmt.Errorf("failed to publish event to topic: %s (channel may be full)", topic)
	}
	return nil
}

// BroadcastIntervalTrigger 定时广播触发器
type BroadcastIntervalTrigger struct {
	interval time.Duration
	topic    string
	task     func(context.Context) error
}

func NewBroadcastIntervalTrigger(interval time.Duration, topic string) trigger.IntervalTrigger {
	return &BroadcastIntervalTrigger{
		interval: interval,
		topic:    topic,
		task:     nil,
	}
}

func (t *BroadcastIntervalTrigger) Name() string {
	return "broadcast-trigger"
}

func (t *BroadcastIntervalTrigger) Type() trigger.TriggerType {
	return trigger.TriggerTypeInterval
}

func (t *BroadcastIntervalTrigger) Interval() time.Duration {
	return t.interval
}

func (t *BroadcastIntervalTrigger) Execute(ctx context.Context) error {
	return t.task(ctx)
}

func (t *BroadcastIntervalTrigger) SetTask(task func(context.Context) error) {
	t.task = task
}

// BroadcastEventTrigger 事件广播触发器
type BroadcastEventTrigger struct {
	topic     string
	eventChan chan interface{}
	task      func(context.Context, interface{}) error
}

// NewBroadcastEventTrigger 创建事件广播触发器
//
// 参数:
//   - topic: 主题名称
//   - bufferSize: 事件 channel 缓冲区大小
//
// 返回:
//   - trigger.EventTrigger: 事件触发器实例
func NewBroadcastEventTrigger(topic string, bufferSize int) *BroadcastEventTrigger {
	if bufferSize <= 0 {
		bufferSize = 4 * 1024
	}
	return &BroadcastEventTrigger{
		topic:     topic,
		eventChan: make(chan interface{}, bufferSize),
		task:      nil,
	}
}

// Name 实现 Trigger 接口
func (t *BroadcastEventTrigger) Name() string {
	return "broadcast-event-trigger-" + t.topic
}

// Type 实现 Trigger 接口
func (t *BroadcastEventTrigger) Type() trigger.TriggerType {
	return trigger.TriggerTypeEvent
}

// Execute 实现 Trigger 接口（基础实现，不使用）
func (t *BroadcastEventTrigger) Execute(ctx context.Context) error {
	// 事件触发器应该调用 ExecuteWithEvent，这里只是为了满足接口
	return nil
}

// EventChannel 实现 EventTrigger 接口
func (t *BroadcastEventTrigger) EventChannel() <-chan interface{} {
	return t.eventChan
}

// ExecuteWithEvent 实现 EventDataHandler 接口
func (t *BroadcastEventTrigger) ExecuteWithEvent(ctx context.Context, event interface{}) error {
	if t.task == nil {
		logger.Warn("(BroadcastEventTrigger) task is nil for topic (%s)", t.topic)
		return nil
	}
	return t.task(ctx, event)
}

// SetTask 设置事件处理任务
func (t *BroadcastEventTrigger) SetTask(task func(context.Context, interface{}) error) {
	t.task = task
}

// PublishEvent 发布事件到 channel（非阻塞）
//
// 参数:
//   - event: 事件数据
//
// 返回:
//   - bool: 是否发布成功
func (t *BroadcastEventTrigger) PublishEvent(event interface{}) bool {
	select {
	case t.eventChan <- event:
		return true
	default:
		logger.Warn("(BroadcastEventTrigger) event channel full for topic (%s), dropping event", t.topic)
		return false
	}
}

// Close 关闭事件 channel
func (t *BroadcastEventTrigger) Close() {
	close(t.eventChan)
}

type BroadcasterType string

const (
	Filter BroadcasterType = "filter"
	Topic  BroadcasterType = "topic"
	User   BroadcasterType = "user"
)

// BroadcasterMessage 广播消息
type BroadcasterMessage struct {
	BroadcasterType BroadcasterType        `json:"broadcaster_type"`
	Topic           string                 `json:"topic"`
	UserID          string                 `json:"user_id"`
	Data            interface{}            `json:"data"`
	Filter          func(*Connection) bool `json:"-"`
}

// ============================================
// Server - WebSocket 服务器
// ============================================

// Server WebSocket 服务器
type Server struct {
	hub                 *Hub
	router              *Router
	subscriptionManager *SubscriptionManager
	upgrader            websocket.HertzUpgrader
	authHandler         func(c *app.RequestContext) (userID string, err error)
	onConnect           func(conn *Connection)
	onDisconnect        func(conn *Connection)
	ctx                 context.Context
	cancel              context.CancelFunc
	cfg                 *configv1.Config
}

func NewServer(cfg *configv1.Config) *Server {
	wscfg := cfg.Websocket
	cctx, cancel := context.WithCancel(context.Background())

	router := NewRouter()
	hub := NewHub(cctx, router, &HubConfig{
		RegisterChannelSize:   wscfg.RegisterChannelSize,
		UnregisterChannelSize: wscfg.UnregisterChannelSize,
		BroadcastChannelSize:  wscfg.BroadcastChannelSize,
	})
	subscriptionManager := NewSubscriptionManager()

	return &Server{
		hub:                 hub,
		router:              router,
		subscriptionManager: subscriptionManager,
		upgrader: websocket.HertzUpgrader{
			ReadBufferSize:  wscfg.ReadBufferSize,
			WriteBufferSize: wscfg.WriteBufferSize,
			CheckOrigin: func(c *app.RequestContext) bool {
				return true
			},
		},
		ctx:    cctx,
		cancel: cancel,
		cfg:    cfg,
	}
}

// 配置方法
func (s *Server) SetAuthHandler(authHandler func(c *app.RequestContext) (string, error)) {
	s.authHandler = authHandler
	logger.Info("(Server) Set auth handler")
}

func (s *Server) SetCheckOrigin(checkOrigin func(c *app.RequestContext) bool) {
	s.upgrader.CheckOrigin = checkOrigin
	logger.Info("(Server) Set check origin")
}

func (s *Server) SetOnConnect(onConnect func(conn *Connection)) {
	s.onConnect = onConnect
	logger.Info("(Server) Set on connect callback")
}

func (s *Server) SetOnDisconnect(onDisconnect func(conn *Connection)) {
	s.onDisconnect = onDisconnect
	logger.Info("(Server) Set on disconnect callback")
}

// Handler 注册
func (s *Server) Handle(routeKey string, handler Handler) {
	s.router.Handle(routeKey, handler)
}

func (s *Server) HandleFunc(routeKey string, handlerFunc func(ctx context.Context, conn *Connection, env *Envelope) *WsResponse) {
	s.router.HandleFunc(routeKey, handlerFunc)
}

// 启动停止
func (s *Server) Start() {
	logger.Info("(Server) Starting WebSocket server")
	s.hub.Run()
}

func (s *Server) Stop() {
	logger.Info("(Server) Stopping WebSocket server")
	s.cancel()
	s.hub.Stop()
}

// HandleRequest WebSocket 升级处理器
func (s *Server) HandleRequest(ctx context.Context, c *app.RequestContext) {
	var userID string
	if s.authHandler != nil {
		var err error
		userID, err = s.authHandler(c)
		if err != nil {
			logger.Warn("(Server) Authentication failed: (%v)", err)
			c.String(401, "认证失败: %s", err.Error())
			return
		}
		logger.Info("(Server) User (%s) authenticated", userID)
	}

	err := s.upgrader.Upgrade(c, func(wsConn *websocket.Conn) {
		conn := NewConnection(wsConn, s.hub, userID, &ConnectionConfig{
			SendChannelSize: s.cfg.Websocket.SendChannelSize,
			MaxMessageSize:  s.cfg.Websocket.MaxMessageSize,
			PongWait:        s.cfg.Websocket.PongWait,
			WriteWait:       s.cfg.Websocket.WriteWait,
			PingPeriod:      s.cfg.Websocket.PingPeriod,
		})

		s.hub.Register(conn)

		if s.onConnect != nil {
			s.onConnect(conn)
		}

		go conn.WritePump()
		conn.ReadPump()

		s.cleanup(conn)
	})

	if err != nil {
		logger.Warn("(Server) WebSocket upgrade failed: (%v)", err)
		c.String(500, "WebSocket 升级失败: %s", err.Error())
		return
	}
}

func (s *Server) cleanup(conn *Connection) {
	count := s.subscriptionManager.UnsubscribeAll(conn.ID)
	if count > 0 {
		logger.Info("(Server) Unsubscribed (%d) topics for connection (%s)", count, conn.ID)
	}

	if s.onDisconnect != nil {
		s.onDisconnect(conn)
	}

	logger.Info("(Server) Connection (%s) cleaned up", conn.ID)
}

func (s *Server) BroadcastOne(bctx *BroadcastContext, broadcaster Broadcaster) {
	message := broadcaster.BroadcastOne(bctx)
	if message == nil {
		logger.Debug("(%s) BroadcasterMessage is nil, skip broadcasting", bctx.Subscription().Topic)
		return
	}
	s.BroadcastToConnID(message.Topic, message.Data, bctx.Subscription().ConnID)
}

func (s *Server) BroadcastRange(bctx *BroadcastContext, broadcaster Broadcaster) {
	message := broadcaster.BroadcastRange(bctx)
	if message == nil {
		return
	}
	switch message.BroadcasterType {
	case Filter:
		s.BroadcastByFilter(message.Topic, message.Data, message.Filter)
	case Topic:
		s.BroadcastToTopic(message.Topic, message.Data)
	case User:
		s.BroadcastToUser(message.UserID, message.Topic, message.Data)
	default:
		logger.Warn("(%s) Invalid broadcaster type: (%s)", message.Topic, message.BroadcasterType)
	}
}

// 广播方法
func (s *Server) BroadcastByFilter(topic string, data interface{}, filter func(*Connection) bool) {
	s.hub.Broadcast(topic, data, filter)
}

func (s *Server) BroadcastToTopic(topic string, data interface{}) {
	subscribers := s.subscriptionManager.GetConnIDsByTopic(topic)
	if len(subscribers) == 0 {
		logger.Debug("(Server) No subscribers for topic (%s), skip broadcast", topic)
		return
	}
	conns := make([]*Connection, 0, len(subscribers))
	for _, connID := range subscribers {
		conn, ok := s.hub.GetConnection(connID)
		if !ok || conn == nil {
			logger.Warn("(Server) Connection (%s) not found in hub", connID)
			continue
		}
		conns = append(conns, conn)
	}
	s.broadcast(topic, data, conns...)
}

func (s *Server) BroadcastToConnID(topic string, data any, connID string) {
	conn, ok := s.hub.GetConnection(connID)
	if !ok || conn == nil {
		logger.Warn("(Server) Connection (%s) not found in hub", connID)
		return
	}
	s.broadcast(topic, data, conn)
}

func (s *Server) BroadcastToUser(userID, topic string, data interface{}) {
	conns := s.hub.GetConnectionsByUser(userID)
	if len(conns) == 0 {
		logger.Info("(Server) User (%s) has no connections, skip broadcast", userID)
		return
	}

	s.broadcast(topic, data, conns...)
}

func (s *Server) broadcast(topic string, data any, conns ...*Connection) {
	sent := 0
	failed := 0
	for _, conn := range conns {
		if err := conn.SendPush(topic, data); err != nil {
			logger.Warn("(Server) Failed to send to connection (%s): (%v)", conn.ID, err)
			failed++
		} else {
			sent++
		}
	}
	logger.Info("(Server) Broadcast to (%d) sent=%d, failed=%d", len(conns), sent, failed)
}

// 查询方法
func (s *Server) GetHub() *Hub {
	return s.hub
}

func (s *Server) GetRouter() *Router {
	return s.router
}

func (s *Server) GetSubscriptionManager() *SubscriptionManager {
	return s.subscriptionManager
}

func (s *Server) GetConnection(connID string) (*Connection, bool) {
	return s.hub.GetConnection(connID)
}

func (s *Server) GetConnectionsByUser(userID string) []*Connection {
	return s.hub.GetConnectionsByUser(userID)
}

func (s *Server) GetStats() map[string]interface{} {
	subStats := s.subscriptionManager.GetStats()

	return map[string]interface{}{
		"connection_count":    s.hub.GetConnectionCount(),
		"user_count":          s.hub.GetUserCount(),
		"topic_count":         subStats["topic_count"],
		"total_subscriptions": subStats["total_subscriptions"],
		"uptime":              time.Since(time.Now()).String(),
	}
}

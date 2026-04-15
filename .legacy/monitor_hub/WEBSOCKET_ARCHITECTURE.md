# WebSocket Architecture - Complete Message Flow

## Overview

This document traces the complete data flow from backend aggregation timer trigger through WebSocket broadcast to frontend client reception in the legacy monitor_hub system.

---

## 1. Backend Timer Trigger → Aggregation

### 1.1 Timer Trigger (pkg/aggregator/trigger.go)

```go
type AggregationTrigger struct {
    manager  *Manager
    interval time.Duration
}

// Fires at fixed interval (from manager.config.GetMinInterval())
func (t *AggregationTrigger) Execute(ctx context.Context) error {
    now := time.Now()
    return t.manager.RunOnce(ctx, now)  // ← Entry point
}
```

### 1.2 Aggregation Execution (pkg/aggregator/manager.go)

```go
// RunOnce executes aggregation for all levels
func (m *Manager) RunOnce(ctx context.Context, now time.Time) error {
    allAggregatedPoints := []AggregatedPoint{}
    
    // 1️⃣ Always run first level (15s)
    points, _ := m.aggregateLevel(ctx, &m.config.Levels[0], now)
    allAggregatedPoints = append(allAggregatedPoints, points...)
    
    // 2️⃣ Check time boundaries for other levels (1m, 5m, 30m, 1h, 6h, 1d)
    for i := 1; i < len(m.config.Levels); i++ {
        level := &m.config.Levels[i]
        if m.isTimeBoundary(level, now) {
            points, _ := m.aggregateLevel(ctx, level, now)
            allAggregatedPoints = append(allAggregatedPoints, points...)
        }
    }
    
    // 3️⃣ Publish aggregation event (KEY STEP)
    if len(allAggregatedPoints) > 0 {
        m.publishAggregationEvent("all", now, allAggregatedPoints)
    }
    return nil
}
```

---

## 2. Event Publishing to Hub

### 2.1 Manager publishes event via EventPublisher interface

```go
// pkg/aggregator/manager.go
type EventPublisher interface {
    PublishEvent(topic string, event interface{}) error
}

// Manager.publishAggregationEvent constructs event
func (m *Manager) publishAggregationEvent(level string, timestamp time.Time, points []AggregatedPoint) {
    if m.eventPublisher == nil {
        return
    }
    
    event := &AggregationEvent{
        Level:     level,
        Timestamp: timestamp,
        Points:    points,
        Count:     len(points),
    }
    
    // Publish to "points" topic
    topic := "points"
    if err := m.eventPublisher.PublishEvent(topic, event); err != nil {
        logger.Error("Failed to publish aggregation event: %v", err)
    }
}
```

### 2.2 Hub's Manager implements EventPublisher

```go
// internal/websocket/websocket.go - Manager struct
type Manager struct {
    wsServer *Server
    triggerMap map[string]trigger.Trigger
    triggerManager trigger.Manager
}

// Manager.PublishEvent routes to BroadcastEventTrigger
func (m *Manager) PublishEvent(topic string, event interface{}) error {
    eventTrigger := m.GetEventTrigger(topic)
    if eventTrigger == nil {
        return fmt.Errorf("event trigger not found for topic: %s", topic)
    }
    
    // Send event to BroadcastEventTrigger's event channel
    if !eventTrigger.PublishEvent(event) {
        return fmt.Errorf("failed to publish event (channel may be full)")
    }
    return nil
}
```

---

## 3. Event Trigger Processing

### 3.1 BroadcastEventTrigger buffers events

```go
// internal/websocket/websocket.go
type BroadcastEventTrigger struct {
    topic     string
    eventChan chan interface{}  // ← Buffered channel (default: 4KB)
    task      func(context.Context, interface{}) error
}

// PublishEvent sends event to channel
func (t *BroadcastEventTrigger) PublishEvent(event interface{}) bool {
    select {
    case t.eventChan <- event:
        return true
    default:
        logger.Warn("event channel full for topic (%s), dropping event", t.topic)
        return false
    }
}
```

### 3.2 Trigger Manager consumes events

The trigger manager's event loop reads from `eventChan`:

```go
// When BroadcastEventTrigger is registered, its task is set:
eventTrigger.SetTask(func(ctx context.Context, event interface{}) error {
    if !m.ShouldBroadcast(broadcaster, topic) {
        return nil
    }
    
    // For each subscription to this topic
    for _, subscription := range m.wsServer.GetSubscriptionManager().GetSubscriptionsByTopic(topic) {
        bctx := NewBroadcastContext(ctx, subscription, topic, event, "event")
        go m.wsServer.BroadcastOne(bctx, broadcaster)  // ← Send to specific connection
    }
    
    // Broadcast to all subscribers matching criteria
    bctx := NewBroadcastContext(ctx, nil, topic, event, "event")
    go m.wsServer.BroadcastRange(bctx, broadcaster)  // ← Send to matching connections
    return nil
})
```

---

## 4. Broadcaster Filtering & Processing

### 4.1 PointsBroadcaster filters aggregated points

```go
// biz/points/v1/broadcast.go
type PointsBroadcaster struct {
    // subscription filters
}

func (b *PointsBroadcaster) BroadcastOne(ctx *websocket.BroadcastContext) *websocket.BroadcasterMessage {
    subscription := ctx.Subscription()
    
    // Extract subscription parameters
    req := &SubscribePointsRequest{}
    // ... decode from subscription data
    
    // Cast AggregationEvent to get points
    aggEvent := ctx.Event().(*AggregationEvent)
    
    // Filter points by:
    // - datasource_id
    // - aggregation_levels
    // - metric_filters
    // - label_filters
    filteredPoints := filterPoints(aggEvent.Points, req)
    
    // Return filtered message
    return &BroadcasterMessage{
        BroadcasterType: Topic,
        Topic: "points",
        Data: &PointsBroadcast{
            Points: filteredPoints,
            Count:  len(filteredPoints),
        },
    }
}
```

### 4.2 DatasourceBroadcaster filters status updates

```go
// biz/datasource/v1/broadcast.go
func (b *DatasourceBroadcaster) BroadcastOne(bctx *websocket.BroadcastContext) *websocket.BroadcasterMessage {
    subscription := bctx.Subscription()
    
    // Query datasource status
    statuses := queryDatasourceStatus(...)
    
    // Return filtered status updates
    return &BroadcasterMessage{
        BroadcasterType: Topic,
        Topic: "datasource.status",
        Data: &DatasourceStatusBroadcast{
            Updates: statuses,
        },
    }
}
```

---

## 5. Hub Message Routing to Connections

### 5.1 BroadcastOne - Send to specific connection

```go
// internal/websocket/websocket.go
func (s *Server) BroadcastOne(bctx *BroadcastContext, broadcaster Broadcaster) {
    message := broadcaster.BroadcastOne(bctx)
    if message == nil {
        return
    }
    // Send to specific connection in subscription
    s.BroadcastToConnID(message.Topic, message.Data, bctx.Subscription().ConnID)
}

func (s *Server) BroadcastToConnID(topic string, data any, connID string) {
    conn, ok := s.hub.GetConnection(connID)
    if !ok || conn == nil {
        logger.Warn("Connection (%s) not found", connID)
        return
    }
    s.broadcast(topic, data, conn)
}
```

### 5.2 BroadcastRange - Send to all matching connections

```go
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
    }
}

func (s *Server) BroadcastToTopic(topic string, data interface{}) {
    // Get all connections subscribed to this topic
    subscribers := s.subscriptionManager.GetConnIDsByTopic(topic)
    conns := make([]*Connection, 0, len(subscribers))
    for _, connID := range subscribers {
        if conn, ok := s.hub.GetConnection(connID); ok && conn != nil {
            conns = append(conns, conn)
        }
    }
    s.broadcast(topic, data, conns...)
}

func (s *Server) broadcast(topic string, data any, conns ...*Connection) {
    for _, conn := range conns {
        if err := conn.SendPush(topic, data); err != nil {
            logger.Warn("Failed to send to connection (%s): %v", conn.ID, err)
        }
    }
}
```

---

## 6. WebSocket Message Encoding & Transmission

### 6.1 Connection.SendPush wraps in envelope

```go
// internal/websocket/websocket.go
func (c *Connection) SendPush(topic string, data any) error {
    // Wrap data in WsEnvelope with type=broadcast
    payload, err := WrapEnvelope(EnvelopeTypeBroadcast, topic, data)
    if err != nil {
        return fmt.Errorf("wrap push failed: %w", err)
    }
    return c.Send(payload)  // ← Send binary payload
}

// WrapEnvelope creates message envelope
func WrapEnvelope(envType EnvelopeType, topic string, data interface{}) ([]byte, error) {
    envelope := &Envelope{
        Type:      string(envType),
        Topic:     topic,
        Data:      data,  // ← Will be JSON marshaled
        Timestamp: time.Now().UnixMilli(),
    }
    return json.Marshal(envelope)
}
```

### 6.2 Connection.Send queues to channel

```go
// Connection has send channel (buffered)
type Connection struct {
    send chan []byte  // ← Buffered channel
    // ...
}

func (c *Connection) Send(data []byte) error {
    c.closeMu.Lock()
    defer c.closeMu.Unlock()
    
    if c.isClosed {
        return fmt.Errorf("connection is closed")
    }
    
    select {
    case c.send <- data:
        return nil
    default:
        logger.Warn("send queue is full, dropping message")
        return fmt.Errorf("send queue is full")
    }
}
```

### 6.3 WritePump sends to WebSocket

```go
// Connection.WritePump (separate goroutine)
func (c *Connection) WritePump() {
    defer func() {
        c.ws.WriteMessage(websocket.CloseMessage, []byte{})
        c.ws.Close()
    }()
    
    for {
        select {
        case message := <-c.send:
            // Write binary frame to WebSocket
            if err := c.ws.WriteMessage(websocket.BinaryMessage, message); err != nil {
                return
            }
        case <-c.ctx.Done():
            return
        }
    }
}
```

---

## 7. Frontend Reception & Rendering

### 7.1 TypeScript WebSocket Client (site/src/apis/websocket.ts)

```typescript
// Client connects and subscribes
export class WebSocketClient {
    private subscriptions = new Map<string, Set<SubscriptionCallback>>();
    
    // Subscribe to topic
    subscribe<T>(topic: string, data: any, callback: SubscriptionCallback<T>): () => void {
        // Add local callback
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
        }
        this.subscriptions.get(topic)!.add(callback);
        
        // Send subscription request to server
        this.send({
            type: 'request',
            topic: topic,
            path: '/subscribe',
            data: data || {}
        });
        
        return () => this.unsubscribe(topic, callback);
    }
    
    // Handle incoming broadcast message
    private handleMessage(data: string) {
        const message: WSMessage = JSON.parse(data);
        
        if (message.type === 'broadcast') {
            this.handleBroadcast(message);
        }
    }
    
    private handleBroadcast(message: WSMessage) {
        const topic = message.topic;
        const callbacks = this.subscriptions.get(topic);
        
        if (callbacks && callbacks.size > 0) {
            callbacks.forEach(callback => {
                try {
                    callback(message.data);  // ← Pass decompressed data to callback
                } catch (error) {
                    console.error('Error in subscription callback:', error);
                }
            });
        }
    }
}
```

### 7.2 Frontend Subscribe to Points (site/src/apis/points.ts)

```typescript
export interface SubscribePointsRequest {
    datasource_id: string;
    aggregation_levels: string[];
    metric_filters?: string[];
    label_filters?: Record<string, string>;
}

export interface PointsBroadcast {
    points: AggregatedPoint[];
    count: number;
}

export function subscribePoints(
    request: SubscribePointsRequest,
    onData: (broadcast: PointsBroadcast) => void
): () => void {
    const client = getWebSocketClient();
    
    // Subscribe with points topic
    return client.subscribe<PointsBroadcast>('points', request, onData);
}

// Usage in React component:
// const unsubscribe = subscribePoints(
//     { datasource_id: 'ds-001', aggregation_levels: ['15s'] },
//     (broadcast) => {
//         // Update chart with broadcast.points
//         updateChart(broadcast.points);
//     }
// );
```

### 7.3 Frontend Data Compression

```typescript
// site/src/apis/points-compressed.ts
// Server sends CompressedPointsResponse format:
interface CompressedPointsResponse {
    k: string[];           // Flattened keys: [ds_id, name, labels_json, level, agg_type, ...]
    v: (number | null)[];  // Flattened values: [timestamp, value, quality_score, ...]
}

export function decompressPoints(
    compressed: CompressedPointsResponse,
    datasourceId: string,
    level: string
): AggregatedPoint[] {
    const points: AggregatedPoint[] = [];
    
    // Decompress from flattened arrays back to object structure
    for (let i = 0; i < compressed.k.length; i += 6) {
        points.push({
            datasource_id: compressed.k[i],
            name: compressed.k[i + 1],
            labels: JSON.parse(compressed.k[i + 2]),
            level: compressed.k[i + 3],
            aggregation_type: compressed.k[i + 4],
            timestamp: compressed.v[i] as number,
            value: compressed.v[i + 1] as number,
            quality: {...},
        });
    }
    
    return points;
}
```

---

## 8. Complete Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND AGGREGATION TIMER                                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
                   AggregationTrigger.Execute()
                           ↓
                   Manager.RunOnce()
                           ↓
        ┌───────────────────────────────────────┐
        │ collectAndAggregate() / cascadeAggregate()
        │ (15s, 1m, 5m, 30m, 1h, 6h levels)     │
        └───────────────────────────────────────┘
                           ↓
           Manager.publishAggregationEvent()
                           ↓
    Manager.PublishEvent(topic="points", event)
                           ↓
        BroadcastEventTrigger.PublishEvent()
                ↓
    Send event to eventChan buffer
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ HUB EVENT TRIGGER LOOP                                          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Trigger manager consumes from eventChan
                           ↓
        BroadcastEventTrigger.ExecuteWithEvent()
                           ↓
        ┌──────────────────────────────────┐
        │ For each subscription:            │
        │   Server.BroadcastOne()           │
        │                                   │
        │ For all subscribers:              │
        │   Server.BroadcastRange()         │
        └──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ BROADCASTER FILTERING (PointsBroadcaster)                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Filter points by:
        - datasource_id
        - aggregation_levels
        - metric_filters
        - label_filters
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ HUB MESSAGE ROUTING                                             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Get subscribed connections from topic
                           ↓
        Connection.SendPush(topic, data)
                           ↓
    WrapEnvelope(type=broadcast, topic, data)
                ↓
    JSON serialize → binary payload
                ↓
        Connection.Send() → send channel
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ CONNECTION WRITE PUMP (separate goroutine)                      │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Read from send channel
                ↓
        WebSocket.WriteMessage(BinaryMessage, payload)
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND WEBSOCKET CLIENT                                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Receive broadcast message
                           ↓
        Parse JSON envelope
                           ↓
        Call subscription callbacks
                           ↓
    Decompress CompressedPointsResponse
                ↓
        Update React charts/components
```

---

## 9. Key Message Structures

### WsEnvelope (broadcast message)
```go
type WsEnvelope struct {
    Type      string          `json:"type"`      // "broadcast"
    Topic     string          `json:"topic"`     // "points" or "datasource.status"
    Path      string          `json:"path"`      // (optional)
    RequestID string          `json:"request_id"`// (optional)
    Data      json.RawMessage `json:"data"`      // PointsBroadcast or DatasourceStatusBroadcast
    Timestamp int64           `json:"timestamp"` // Unix milliseconds
}
```

### PointsBroadcast (data payload for "points" topic)
```typescript
interface PointsBroadcast {
    // Compressed format
    p: CompressedPointsResponse;  // {k: keys[], v: values[]}
    
    // Summary tables (optional)
    t?: SummaryTable[];
    
    // Count of time series
    count: number;
}

interface AggregatedPoint {
    datasource_id: string;
    name: string;
    labels: Record<string, string>;
    level: string;
    timestamp: number;
    aggregation_type: 'avg' | 'min' | 'max' | 'count' | 'last';
    value: number;
    quality: DataQuality;
}
```

### DatasourceStatusBroadcast (data payload for "datasource.status" topic)
```typescript
interface DatasourceStatusBroadcast {
    updates: DatasourceStatus[];
}

interface DatasourceStatus {
    datasource_id: string;
    name: string;
    app_id: string;
    addresses: AddressStatus[];
    overall_status: 'online' | 'offline';
    healthy_count: number;
    total_count: number;
    last_check_time: number;
}

interface AddressStatus {
    address: string;
    status: 'online' | 'offline';
    latency_ms: number;
    error_message?: string;
    last_online_time: number;
    total_series: number;
    disk_size: number;
    retention_days: number;
    total_samples: number;
}
```

---

## 10. Performance Characteristics

| Component | Detail |
|-----------|--------|
| **Aggregation Interval** | 15s (minimum), configured in manager.config.GetMinInterval() |
| **Event Channel Buffer** | 4KB (4096 items) - can hold 4096 AggregationEvent |
| **Connection Send Queue** | Buffered channel - size determined by channel capacity |
| **Compression** | Points compressed to flattened k/v arrays (reduces ~70% size) |
| **Routing** | Parallel goroutines for each connection (BroadcastOne/BroadcastRange) |
| **Broadcast Types** | Topic, User, Filter-based routing |

---

## 11. Subscription Management

### Backend Subscription Storage
```go
type Subscription struct {
    ConnID string              // WebSocket connection ID
    Topic  string              // "points" or "datasource.status"
    Data   interface{}         // SubscribePointsRequest or similar
    Filter func(*Connection) bool
}

type SubscriptionManager struct {
    subscriptions map[string]*Subscription  // connID → subscription
}
```

### Frontend Subscription Lifecycle
1. **Subscribe**: Send `{type:'request', topic, path:'/subscribe', data}` → server registers subscription
2. **Receive**: Server broadcasts events → client receives `{type:'broadcast', topic, data}`
3. **Process**: Callback executes with decompressed data
4. **Unsubscribe**: Send `{type:'request', topic, path:'/unsubscribe'}` → server removes subscription

---

## 12. Error Handling

| Point | Error Handling |
|-------|---|
| **Event channel full** | Log warning, drop event |
| **Broadcaster not found** | Return nil (skip broadcast) |
| **Connection not found** | Log warning, continue |
| **Send queue full** | Log warning, return error |
| **JSON parsing error** | Log error, continue to next message |

---

## Summary

The WebSocket architecture implements a **topic-based pub/sub pattern** with the following flow:

1. **Timer fires** (15s interval) → **Manager.RunOnce()** aggregates data across levels
2. **Event published** via Manager.PublishEvent() → **BroadcastEventTrigger** queues event
3. **Trigger manager** consumes event → calls SetTask callback
4. **Broadcaster filters** points by subscription criteria (datasource, levels, filters)
5. **Hub routes** to subscribed connections in parallel goroutines
6. **Connection serializes** envelope + sends to WebSocket WritePump
7. **WritePump sends** binary message to client
8. **Frontend client** receives, parses, decompresses, and updates UI

The system is designed for **horizontal scalability** with independent connection handling and supports **filtered subscriptions** to reduce network overhead on the client side.

package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Message WebSocket 消息
type Message struct {
	Topic   string      `json:"topic"`
	Payload interface{} `json:"payload"`
	Ts      int64       `json:"ts"`
}

// client 单个连接
type client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	topics map[string]bool
	mu     sync.RWMutex
}

// Hub WebSocket 中心
type Hub struct {
	clients    map[*client]bool
	broadcast  chan *Message
	register   chan *client
	unregister chan *client
	mu         sync.RWMutex
}

// NewHub 创建 Hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*client]bool),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *client),
		unregister: make(chan *client),
	}
}

// Run 启动 Hub
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()
			log.Printf("[INFO] ws: client connected, total=%d", len(h.clients))
		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()
			log.Printf("[INFO] ws: client disconnected, total=%d", len(h.clients))
		case msg := <-h.broadcast:
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			h.mu.RLock()
			for c := range h.clients {
				// Check topic subscription
				c.mu.RLock()
				subscribed := len(c.topics) == 0 || c.topics[msg.Topic]
				c.mu.RUnlock()
				if !subscribed {
					continue
				}
				select {
				case c.send <- data:
				default:
					// Client buffer full, drop
				}
			}
			h.mu.RUnlock()
		}
	}
}

// PublishEvent 发布事件（实现 aggregator.EventPublisher 接口）
func (h *Hub) PublishEvent(topic string, payload interface{}) error {
	msg := &Message{
		Topic:   topic,
		Payload: payload,
		Ts:      time.Now().UnixMilli(),
	}
	select {
	case h.broadcast <- msg:
	default:
		return fmt.Errorf("broadcast channel full")
	}
	return nil
}

// Publish 发布消息到特定 topic
func (h *Hub) Publish(topic string, payload interface{}) {
	_ = h.PublishEvent(topic, payload)
}

// ServeWS 处理 WebSocket 升级请求
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ERROR] ws: upgrade failed: %v", err)
		return
	}
	c := &client{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	h.register <- c
	go c.writePump()
	go c.readPump()
}

func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(512 * 1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Parse subscription message: {"subscribe": "topic"}
		var sub struct {
			Subscribe   string `json:"subscribe"`
			Unsubscribe string `json:"unsubscribe"`
		}
		if err := json.Unmarshal(message, &sub); err == nil {
			c.mu.Lock()
			if sub.Subscribe != "" {
				c.topics[sub.Subscribe] = true
			}
			if sub.Unsubscribe != "" {
				delete(c.topics, sub.Unsubscribe)
			}
			c.mu.Unlock()
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

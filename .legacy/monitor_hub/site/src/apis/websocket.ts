/**
 * WebSocket 客户端封装
 * 提供统一的消息格式、自动重连、订阅管理等功能
 */

// ============================================
// 类型定义
// ============================================

/** WebSocket 消息类型 */
export type MessageType = 'request' | 'response' | 'broadcast' | 'heartbeat'

/** WebSocket 消息包装器（WsEnvelope） */
export interface WSMessage<T = any> {
  /** 消息类型：request/response/broadcast/heartbeat */
  type: MessageType
  /** 资源主题（如 datasource.status） */
  topic?: string
  /** 操作路径（相对于 topic，如 /subscribe，仅 request 需要） */
  path?: string
  /** 请求ID（可选，用于匹配请求和响应） */
  request_id?: string
  /** 业务数据（JSON 格式） */
  data?: T
  /** 消息时间戳（Unix 毫秒，后端会自动填充） */
  timestamp?: number
}

/** WebSocket 响应结构（WsResponse） */
export interface WSResponse<T = any> {
  /** 响应码：0=成功，非0=失败 */
  code: number
  /** 响应描述 */
  message: string
  /** 响应业务数据（可选） */
  data?: T
}

/** WebSocket 心跳数据（WsHeartbeat） */
export interface WSHeartbeat {
  /** 客户端时间戳（毫秒） */
  client_time: number
  /** 服务端时间戳（毫秒，pong 时填充） */
  server_time?: number
}

/** 订阅回调函数 */
export type SubscriptionCallback<T = any> = (data: T) => void

/** WebSocket 配置 */
export interface WSConfig {
  url: string
  /** 自动重连 */
  autoReconnect?: boolean
  /** 重连间隔（毫秒） */
  reconnectInterval?: number
  /** 最大重连次数 */
  maxReconnectAttempts?: number
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number
  /** 连接超时（毫秒） */
  connectTimeout?: number
  /** 调试模式 */
  debug?: boolean
}

/** WebSocket 状态 */
export enum WSState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  CLOSED = 'closed'
}

// ============================================
// WebSocket 客户端类
// ============================================

export class WebSocketClient {
  private ws: WebSocket | null = null
  private config: Required<WSConfig>
  private state: WSState = WSState.DISCONNECTED
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private connectTimeoutTimer: number | null = null

  // 订阅管理
  private subscriptions = new Map<string, Set<SubscriptionCallback>>()
  
  // 状态监听器
  private stateListeners = new Set<(state: WSState) => void>()

  constructor(config: WSConfig) {
    this.config = {
      url: config.url,
      autoReconnect: config.autoReconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      connectTimeout: config.connectTimeout ?? 10000,
      debug: config.debug ?? false
    }
  }

  // ============================================
  // 连接管理
  // ============================================

  /** 连接 WebSocket */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.log('Already connected')
        resolve()
        return
      }

      this.setState(WSState.CONNECTING)
      this.log('Connecting to', this.config.url)

      try {
        this.ws = new WebSocket(this.config.url)
        
        // 连接超时处理
        this.connectTimeoutTimer = window.setTimeout(() => {
          this.log('Connection timeout')
          this.ws?.close()
          reject(new Error('Connection timeout'))
        }, this.config.connectTimeout)

        this.ws.onopen = () => {
          this.clearConnectTimeout()
          this.setState(WSState.CONNECTED)
          this.reconnectAttempts = 0
          this.log('Connected')
          this.startHeartbeat()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          this.clearConnectTimeout()
          this.log('WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          this.clearConnectTimeout()
          this.setState(WSState.DISCONNECTED)
          this.stopHeartbeat()
          this.log('Connection closed')
          this.handleReconnect()
        }
      } catch (error) {
        this.clearConnectTimeout()
        this.log('Failed to create WebSocket:', error)
        reject(error)
      }
    })
  }

  /** 断开连接 */
  disconnect() {
    this.log('Disconnecting...')
    this.config.autoReconnect = false // 禁用自动重连
    this.clearReconnectTimer()
    this.stopHeartbeat()
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.setState(WSState.CLOSED)
  }

  /** 获取当前状态 */
  getState(): WSState {
    return this.state
  }

  /** 监听状态变化 */
  onStateChange(listener: (state: WSState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  // ============================================
  // 订阅管理
  // ============================================

  /**
   * 订阅主题
   * @param topic 主题名称（如 'datasource.status'）
   * @param callback 接收广播数据的回调函数
   * @param data 订阅参数（可选，如过滤条件等）
   * @returns 取消订阅函数
   */ 
  subscribe<T = any>(topic: string, data: any , callback: SubscriptionCallback<T>): () => void {
    this.log('Subscribing to', topic)
    
    // 添加本地订阅
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }
    this.subscriptions.get(topic)!.add(callback as SubscriptionCallback)

    // 发送订阅请求到服务器（使用新协议：request + topic + path）
    this.send({
      type: 'request',
      topic: topic,
      path: '/subscribe',
      data: data || {}
    })

    // 返回取消订阅函数
    return () => this.unsubscribe(topic, callback)
  }

  /**
   * 取消订阅
   * @param topic 主题名称
   * @param callback 可选的回调函数，如果不传则取消该主题的所有订阅
   */
  unsubscribe(topic: string, callback?: SubscriptionCallback) {
    this.log('Unsubscribing from', topic)
    
    const callbacks = this.subscriptions.get(topic)
    if (!callbacks) return

    if (callback) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscriptions.delete(topic)
        // 通知服务器取消订阅（使用新协议）
        this.send({
          type: 'request',
          topic: topic,
          path: '/unsubscribe',
          data: { topic }
        })
      }
    } else {
      // 取消该主题的所有订阅
      this.subscriptions.delete(topic)
      this.send({
        type: 'request',
        topic: topic,
        path: '/unsubscribe',
        data: { topic }
      })
    }
  }

  // ============================================
  // 消息处理
  // ============================================

  /** 发送消息 */
  send(message: WSMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('WebSocket not connected, cannot send message')
      return false
    }

    try {
      // 后端会自动填充 timestamp，客户端不需要设置
      const json = JSON.stringify(message)
      this.log('Sending:', message)
      this.ws.send(json)
      return true
    } catch (error) {
      this.log('Failed to send message:', error)
      return false
    }
  }

  /** 处理接收到的消息 */
  private handleMessage(data: string) {
    try {
      const message: WSMessage = JSON.parse(data)
      this.log('Received:', message)

      // 处理不同类型的消息
      switch (message.type) {
        case 'broadcast':
          // 服务端推送的广播消息
          this.handleBroadcast(message)
          break
        case 'response':
          // 服务端对请求的响应
          this.handleResponse(message)
          break
        case 'heartbeat':
          // 心跳响应（pong）
          this.handleHeartbeat(message)
          break
        default:
          this.log('Unknown message type:', message.type)
      }
    } catch (error) {
      this.log('Failed to parse message:', error)
    }
  }

  /** 处理广播消息 */
  private handleBroadcast(message: WSMessage) {
    const topic = message.topic
    if (!topic) {
      this.log('Broadcast message missing topic')
      return
    }

    const callbacks = this.subscriptions.get(topic)
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach(callback => {
        try {
          callback(message.data)
        } catch (error) {
          this.log('Error in subscription callback:', error)
        }
      })
    } else {
      this.log('No subscribers for topic:', topic)
    }
  }

  /** 处理响应消息 */
  private handleResponse(message: WSMessage) {
    // 解析响应数据（WsResponse 格式）
    const response = message.data as WSResponse
    if (response) {
      if (response.code === 0) {
        this.log('Response success:', response.message, response.data)
      } else {
        this.log('Response error:', response.code, response.message, response.data)
      }
    } else {
      this.log('Response:', message)
    }
  }

  /** 处理心跳响应 */
  private handleHeartbeat(message: WSMessage) {
    const heartbeat = message.data as WSHeartbeat
    if (heartbeat && heartbeat.server_time) {
      const rtt = Date.now() - heartbeat.client_time
      this.log(`Heartbeat: RTT=${rtt}ms, server_time=${heartbeat.server_time}`)
    }
  }

  // ============================================
  // 心跳和重连
  // ============================================

  /** 开始心跳 */
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      // 发送心跳消息（使用新协议）
      const heartbeat: WSHeartbeat = {
        client_time: Date.now()
      }
      this.send({
        type: 'heartbeat',
        data: heartbeat
      })
    }, this.config.heartbeatInterval)
  }

  /** 停止心跳 */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 处理重连 */
  private handleReconnect() {
    if (!this.config.autoReconnect) {
      this.log('Auto reconnect disabled')
      return
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached')
      this.setState(WSState.CLOSED)
      return
    }

    this.setState(WSState.RECONNECTING)
    this.reconnectAttempts++
    this.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`)

    this.reconnectTimer = window.setTimeout(() => {
      this.connect()
        .then(() => {
          // 重新订阅所有主题
          this.resubscribeAll()
        })
        .catch((error) => {
          this.log('Reconnect failed:', error)
        })
    }, this.config.reconnectInterval)
  }

  /** 重新订阅所有主题 */
  private resubscribeAll() {
    this.log('Resubscribing to all topics')
    this.subscriptions.forEach((_, topic) => {
      // 使用新协议重新订阅
      this.send({
        type: 'request',
        topic: topic,
        path: '/subscribe',
        data: {}
      })
    })
  }

  /** 清除重连定时器 */
  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /** 清除连接超时定时器 */
  private clearConnectTimeout() {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer)
      this.connectTimeoutTimer = null
    }
  }

  // ============================================
  // 工具方法
  // ============================================

  /** 设置状态 */
  private setState(state: WSState) {
    if (this.state !== state) {
      this.state = state
      this.log('State changed to:', state)
      this.stateListeners.forEach(listener => listener(state))
    }
  }

  /** 日志输出 */
  private log(...args: any[]) {
    if (this.config.debug) {
      console.log('[WebSocket]', ...args)
    }
  }
}

// ============================================
// 导出默认实例（可选）
// ============================================

let defaultClient: WebSocketClient | null = null

/** 获取或创建默认 WebSocket 客户端 */
export function getWebSocketClient(config?: WSConfig): WebSocketClient {
  if (!defaultClient && config) {
    defaultClient = new WebSocketClient(config)
  }
  if (!defaultClient) {
    throw new Error('WebSocket client not initialized. Please provide config.')
  }
  return defaultClient
}

/** 初始化默认客户端 */
export function initWebSocket(config: WSConfig): WebSocketClient {
  defaultClient = new WebSocketClient(config)
  return defaultClient
}


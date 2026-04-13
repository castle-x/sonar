import { memo, useEffect, useState, useRef } from 'react'
import { WebSocketClient, WSState } from '@/apis/websocket'
import { buildWsUrl } from '@/config/api'
import { 
  subscribePoints, 
  setWebSocketClient,
  groupPointsByMetricAndLabels,
  type AggregatedPoint,
  type PointsBroadcast
} from '@/apis/points'

export default memo(() => {
  // WebSocket 客户端实例
  const wsClient = useRef<WebSocketClient | null>(null)
  
  // 状态管理
  const [wsState, setWsState] = useState<WSState>(WSState.DISCONNECTED)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [messages, setMessages] = useState<PointsBroadcast[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [datasourceId, setDatasourceId] = useState('ds-test-001')
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['15s', '1m'])
  
  // 保存取消订阅函数的引用
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // 展开/折叠状态（记录每条消息的展开状态）
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())

  // 切换消息展开/折叠
  const toggleMessageExpand = (index: number) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  // 初始化 WebSocket 客户端
  useEffect(() => {
    // 创建客户端实例
    wsClient.current = new WebSocketClient({
      url: buildWsUrl(),
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      debug: import.meta.env.DEV
    })

    // 设置到 points API（让 API 可以使用这个客户端）
    setWebSocketClient(wsClient.current)

    // 监听状态变化
    const unsubscribeState = wsClient.current.onStateChange((state) => {
      setWsState(state)
      console.log('WebSocket state changed:', state)
    })

    return () => {
      // 清理订阅
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      // 清理状态监听
      unsubscribeState()
      // 断开连接
      wsClient.current?.disconnect()
    }
  }, [])

  // 连接 WebSocket
  const handleConnect = async () => {
    try {
      await wsClient.current?.connect()
      console.log('WebSocket connected successfully')
    } catch (error) {
      console.error('Failed to connect:', error)
      alert('连接失败：' + error)
    }
  }

  // 断开连接
  const handleDisconnect = () => {
    // 断开前先清理订阅
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    wsClient.current?.disconnect()
    setIsSubscribed(false)
  }

  // 订阅聚合数据
  const handleSubscribe = () => {
    if (!wsClient.current) {
      alert('WebSocket 客户端未初始化')
      return
    }

    if (!datasourceId) {
      alert('请输入数据源ID')
      return
    }

    if (selectedLevels.length === 0) {
      alert('请至少选择一个聚合等级')
      return
    }

    // 如果已经订阅过，先取消之前的订阅
    if (unsubscribeRef.current) {
      console.log('Cleaning up previous subscription')
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    // 使用 points API 的订阅方法
    const unsubscribe = subscribePoints(
      {
        datasource_id: datasourceId,
        aggregation_levels: selectedLevels,
        // metric_filters: ['cpu_usage', 'memory_usage'],  // 可选：过滤指标
        // label_filters: { env: 'production' }           // 可选：过滤标签
      },
      (data: PointsBroadcast) => {
        console.log('Received points broadcast:', data)
        setMessages(prev => [data, ...prev].slice(0, 20)) // 保留最新 20 条
        setLastUpdate(new Date())
      }
    )

    // 保存取消订阅函数
    unsubscribeRef.current = unsubscribe
    setIsSubscribed(true)
    console.log(`Subscribed to points for datasource: ${datasourceId}, levels:`, selectedLevels)
  }

  // 取消订阅
  const handleUnsubscribe = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setIsSubscribed(false)
    console.log('Unsubscribed from points')
  }

  // 清空消息
  const handleClear = () => {
    setMessages([])
    setLastUpdate(null)
  }

  // 切换聚合等级
  const toggleLevel = (level: string) => {
    setSelectedLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level)
      } else {
        return [...prev, level]
      }
    })
  }

  // 格式化时间戳（毫秒）
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  // 格式化数值（智能精度）
  const formatValue = (value: number) => {
    // 处理大数
    if (Math.abs(value) >= 1000000) {
      return (value / 1000000).toFixed(2) + 'M'
    } else if (Math.abs(value) >= 1000) {
      return (value / 1000).toFixed(2) + 'K'
    }
    
    // 智能小数位数
    const absValue = Math.abs(value)
    if (absValue === 0) return '0'
    if (absValue >= 100) return value.toFixed(2)     // 100+ : 2位小数
    if (absValue >= 10) return value.toFixed(3)      // 10-100 : 3位小数
    if (absValue >= 1) return value.toFixed(4)       // 1-10 : 4位小数
    if (absValue >= 0.01) return value.toFixed(4)    // 0.01-1 : 4位小数
    if (absValue >= 0.0001) return value.toFixed(6)  // 0.0001-0.01 : 6位小数
    return value.toExponential(2)                    // 非常小的数用科学计数法
  }

  // 获取等级颜色
  const getLevelColor = (level: string) => {
    switch (level) {
      case '15s':
        return '#3b82f6'
      case '1m':
        return '#10b981'
      case '5m':
        return '#f59e0b'
      case '15m':
        return '#8b5cf6'
      case '1h':
        return '#ec4899'
      default:
        return '#6b7280'
    }
  }

  // 获取聚合类型颜色
  const getAggregationTypeColor = (type: string) => {
    switch (type) {
      case 'avg':
        return '#3b82f6'
      case 'min':
        return '#10b981'
      case 'max':
        return '#ef4444'
      case 'sum':
        return '#f59e0b'
      case 'last':
        return '#8b5cf6'
      default:
        return '#6b7280'
    }
  }

  // 获取质量状态颜色
  const getQualityColor = (status: string) => {
    switch (status) {
      case 'complete':
        return '#10b981'
      case 'partial':
        return '#f59e0b'
      case 'degraded':
        return '#f59e0b'
      case 'missing':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        WebSocket 聚合数据推送测试
      </h1>

      {/* 控制面板 */}
      <div style={{ 
        border: '1px solid #ccc', 
        padding: '15px', 
        borderRadius: '8px',
        marginBottom: '20px',
        backgroundColor: '#f9f9f9'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
          控制面板
        </h2>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>连接状态：</strong>
          <span style={{ 
            marginLeft: '10px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: wsState === WSState.CONNECTED ? '#4ade80' : '#f87171',
            color: 'white',
            fontSize: '12px'
          }}>
            {wsState}
          </span>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>订阅状态：</strong>
          <span style={{ marginLeft: '10px' }}>
            {isSubscribed ? `已订阅 points (${selectedLevels.join(', ')})` : '未订阅'}
          </span>
        </div>

        {/* 数据源ID输入 */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            数据源ID:
          </label>
          <input
            type="text"
            value={datasourceId}
            onChange={(e) => setDatasourceId(e.target.value)}
            disabled={isSubscribed}
            placeholder="请输入数据源ID"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>

        {/* 聚合等级选择 */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            聚合等级（推荐订阅小级别）:
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['15s', '1m', '5m', '15m', '1h'].map(level => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                disabled={isSubscribed}
                style={{
                  padding: '6px 12px',
                  border: selectedLevels.includes(level) ? '2px solid' : '1px solid #d1d5db',
                  borderColor: selectedLevels.includes(level) ? getLevelColor(level) : '#d1d5db',
                  backgroundColor: selectedLevels.includes(level) ? getLevelColor(level) : 'white',
                  color: selectedLevels.includes(level) ? 'white' : '#374151',
                  borderRadius: '4px',
                  cursor: isSubscribed ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: selectedLevels.includes(level) ? 'bold' : 'normal',
                  opacity: isSubscribed ? 0.6 : 1
                }}
              >
                {level}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '5px', fontSize: '12px', color: '#6b7280' }}>
            💡 推荐订阅小级别（15s、1m、5m），大级别数据建议使用 HTTP API 查询
          </div>
        </div>

        {lastUpdate && (
          <div style={{ marginBottom: '10px' }}>
            <strong>最后更新：</strong>
            <span style={{ marginLeft: '10px' }}>
              {lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
          <button
            onClick={handleConnect}
            disabled={wsState === WSState.CONNECTED || wsState === WSState.CONNECTING}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: wsState === WSState.CONNECTED ? 0.5 : 1
            }}
          >
            连接
          </button>

          <button
            onClick={handleDisconnect}
            disabled={wsState === WSState.DISCONNECTED || wsState === WSState.CLOSED}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: wsState === WSState.DISCONNECTED ? 0.5 : 1
            }}
          >
            断开
          </button>

          <button
            onClick={handleSubscribe}
            disabled={wsState !== WSState.CONNECTED || isSubscribed}
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: (wsState !== WSState.CONNECTED || isSubscribed) ? 0.5 : 1
            }}
          >
            订阅聚合数据
          </button>

          <button
            onClick={handleUnsubscribe}
            disabled={!isSubscribed}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: !isSubscribed ? 0.5 : 1
            }}
          >
            取消订阅
          </button>

          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            清空消息
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div style={{ 
        border: '1px solid #ccc', 
        padding: '15px', 
        borderRadius: '8px',
        backgroundColor: '#fff'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          实时消息推送 ({messages.length} 条)
        </h2>

        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            暂无消息，请先连接并订阅
          </div>
        ) : (
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {messages.map((msg, idx) => {
              const isExpanded = expandedMessages.has(idx)
              const metricGroups = groupPointsByMetricAndLabels(msg.points)
              
              return (
                <div 
                  key={idx}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '10px',
                    backgroundColor: '#f9fafb'
                  }}
                >
                  {/* 消息头部信息（从第一个点获取） */}
                  {msg.points.length > 0 && (
                    <div style={{ 
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      <div>
                        <span style={{ 
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: getLevelColor(msg.points[0].level),
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          marginRight: '10px'
                        }}>
                          {msg.points[0].level}
                        </span>
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>
                          数据源: {msg.points[0].datasource_id}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        时间: {formatTimestamp(msg.points[0].timestamp)}
                      </div>
                    </div>
                  )}

                  {/* 数据点统计和展开/折叠按钮 */}
                  <div style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <strong>数据点数量: </strong>
                      <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{msg.count}</span>
                      <span style={{ marginLeft: '10px', color: '#6b7280' }}>
                        ({metricGroups.size} 个指标)
                      </span>
                    </div>
                    <button
                      onClick={() => toggleMessageExpand(idx)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: isExpanded ? '#3b82f6' : '#e5e7eb',
                        color: isExpanded ? 'white' : '#374151',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isExpanded ? '▼ 折叠详情' : '▶ 展开详情'}
                    </button>
                  </div>

                  {/* 数据点列表（按指标分组） - 可折叠 */}
                  {isExpanded && (
                    <div style={{ marginTop: '10px' }}>
                      <strong style={{ fontSize: '14px', marginBottom: '8px', display: 'block' }}>
                        数据点详情（按指标分组）:
                      </strong>
                      {Array.from(metricGroups).map(([metricKey, points], groupIdx) => {
                        // 提取指标名称（key 格式: name|labels）
                        const metricName = metricKey.split('|')[0]
                        return (
                    <div 
                      key={groupIdx}
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px'
                      }}
                    >
                      {/* 指标名称 */}
                      <div style={{ 
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <strong style={{ fontSize: '15px', color: '#1f2937' }}>
                          📊 {metricName}
                        </strong>
                        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#6b7280' }}>
                          ({points.length} 个聚合类型)
                        </span>
                      </div>

                      {/* 标签（使用第一个点的标签，过滤掉内部标签） */}
                      <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                        <strong style={{ marginRight: '6px' }}>标签:</strong>
                        {Object.entries(points[0].labels)
                          .filter(([key]) => !key.startsWith('__'))
                          .map(([key, value]) => (
                            <span 
                              key={key}
                              style={{
                                display: 'inline-block',
                                marginRight: '6px',
                                marginBottom: '4px',
                                padding: '2px 6px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '3px',
                                color: '#4b5563'
                              }}
                            >
                              {key}={value}
                            </span>
                          ))}
                      </div>

                      {/* 聚合类型数据 */}
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '10px'
                      }}>
                        {points.map((point, pointIdx) => (
                          <div 
                            key={pointIdx}
                            style={{
                              padding: '10px',
                              backgroundColor: '#f9fafb',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px'
                            }}
                          >
                            {/* 聚合类型标签 */}
                            <div style={{ marginBottom: '8px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '3px',
                                backgroundColor: getAggregationTypeColor(point.aggregation_type),
                                color: 'white',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                              }}>
                                {point.aggregation_type}
                              </span>
                            </div>

                            {/* 值 */}
                            <div style={{ marginBottom: '6px' }}>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>值</div>
                              <div style={{ 
                                fontSize: '18px', 
                                fontWeight: 'bold', 
                                color: getAggregationTypeColor(point.aggregation_type) 
                              }}>
                                {formatValue(point.value)}
                              </div>
                            </div>

                            {/* 质量信息 */}
                            <div style={{ 
                              marginTop: '8px',
                              paddingTop: '6px',
                              borderTop: '1px solid #e5e7eb',
                              fontSize: '11px'
                            }}>
                              <div style={{ marginBottom: '3px' }}>
                                <span style={{ color: '#6b7280' }}>质量: </span>
                                <span style={{ 
                                  fontWeight: 'bold',
                                  color: getQualityColor(point.quality.status)
                                }}>
                                  {point.quality.status}
                                </span>
                              </div>
                              <div style={{ marginBottom: '3px', color: '#6b7280' }}>
                                分数: {point.quality.score.toFixed(1)}%
                              </div>
                              <div style={{ color: '#6b7280' }}>
                                点数: {point.quality.actual_points}/{point.quality.expected_points}
                              </div>
                              {point.quality.missing_reason && (
                                <div style={{ 
                                  marginTop: '4px', 
                                  fontSize: '10px',
                                  color: '#ef4444'
                                }}>
                                  {point.quality.missing_reason}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 时间戳 */}
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af' }}>
                        时间: {formatTimestamp(points[0].timestamp)}
                      </div>
                    </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#eff6ff',
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <h3 style={{ fontWeight: 'bold', marginBottom: '8px' }}>使用说明：</h3>
        <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
          <li>点击 "连接" 按钮连接 WebSocket 服务器</li>
          <li>输入数据源 ID（例如：ds-test-001）</li>
          <li>选择要订阅的聚合等级（推荐选择 15s 和 1m）</li>
          <li>点击 "订阅聚合数据" 开始订阅</li>
          <li>后端在每次聚合完成后会自动推送数据（事件触发）</li>
          <li>你可以在下方看到实时推送的聚合数据点</li>
          <li>测试完成后可以点击 "取消订阅" 或 "断开" 关闭连接</li>
        </ol>
        <div style={{ 
          marginTop: '12px', 
          padding: '10px', 
          backgroundColor: '#dbeafe', 
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <strong>💡 提示：</strong>
          <ul style={{ marginLeft: '20px', marginTop: '6px', lineHeight: '1.6' }}>
            <li>推荐订阅小级别数据（15s、1m、5m）以获得实时更新</li>
            <li>大级别数据（15m、1h、6h、1d）建议使用 HTTP API 查询</li>
            <li><strong>扁平化设计</strong>：每个指标会产生 5 个数据点（avg/min/max/sum/last）</li>
            <li>聚合类型存储在 <code>aggregation_type</code> 字段中</li>
            <li>每个数据点包含 <code>quality</code> 质量信息（状态、分数、采样点数等）</li>
            <li>标签中可能包含内部标签（如 __aggregation_level__）</li>
          </ul>
        </div>
        <div style={{ 
          marginTop: '8px', 
          padding: '10px', 
          backgroundColor: '#fef3c7', 
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <strong>📊 数据结构说明：</strong>
          <ul style={{ marginLeft: '20px', marginTop: '6px', lineHeight: '1.6' }}>
            <li><strong>avg</strong>: 平均值 - 蓝色</li>
            <li><strong>min</strong>: 最小值 - 绿色</li>
            <li><strong>max</strong>: 最大值 - 红色</li>
            <li><strong>sum</strong>: 总和 - 橙色</li>
            <li><strong>last</strong>: 最后值 - 紫色</li>
          </ul>
        </div>
      </div>
    </div>
  )
})


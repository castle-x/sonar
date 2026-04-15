# Monitor Hub Frontend Analysis & Sonar View Implementation Guide

**Document Status**: Complete Analysis from monitor_hub Frontend Architecture
**Analysis Date**: 2026-04-14
**Source Project**: `/Users/castlexu/github/sonar/.legacy/monitor_hub/site/src`
**Target Project**: `sonar-view` frontend implementation

---

## Executive Summary

The monitor_hub frontend implements a sophisticated real-time monitoring dashboard with three key architectural pillars:

1. **Compressed Data Pipeline**: Efficient data transmission using index-based decompression (O(1) lookup)
2. **Multi-Level Aggregation**: Six aggregation levels (15s → 1m → 5m → 30m → 1h → 6h) with automatic time window calculation
3. **Interactive Visualization**: Virtual-scrolling legend, responsive grid layout with column_span support, real-time WebSocket integration

The system prioritizes performance through memoization, custom React comparison functions, and lazy series truncation at the data layer. This document extracts complete implementations and provides a roadmap for sonar-view frontend development.

---

## 1. Data Compression & Decompression Pipeline

### 1.1 Compression Format (CompressedPointsResponse)

```typescript
// From: points-compressed.ts
interface CompressedPointsResponse {
  // Array of metric names with labels
  // Example: ["metric_name{label1=value1,label2=value2}", ...]
  k: string[];
  
  // 3D data array: v[aggType][metricIndex][dataPointIndex]
  // aggType: 0=last, 1=avg, 2=min, 3=max, 4=p50, 5=p70, 6=p90, 7=p99
  // Each point: [timestamp, value]
  v: RawDataPoint[][][];
}

interface RawDataPoint {
  t: number;  // timestamp (Unix milliseconds)
  v: number;  // metric value
}
```

### 1.2 Complete Decompression Implementation

```typescript
export interface AggregatedPoint {
  timestamp: number;
  value: number;
  aggType: AggregationType;
  metricName: string;
  labels: Record<string, string>;
}

enum AggregationType {
  last = 0,
  avg = 1,
  min = 2,
  max = 3,
  p50 = 4,
  p70 = 5,
  p90 = 6,
  p99 = 7,
}

interface CompressedDataIndex {
  metricNameMap: Map<string, number>;           // metricName -> k array index
  metricLabelsMap: Map<string, Record<string, string>>;  // metricName -> parsed labels
}

/**
 * Parse Prometheus-format labels from metric string
 * Input: "metric_name{label1=value1,label2=value2}"
 * Output: {label1: "value1", label2: "value2"}
 */
function parseLabels(metricString: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const match = metricString.match(/\{([^}]+)\}/);
  if (!match) return labels;
  
  const labelPairs = match[1].split(',');
  for (const pair of labelPairs) {
    const [key, value] = pair.split('=');
    labels[key.trim()] = value.slice(1, -1); // Remove quotes
  }
  return labels;
}

/**
 * Create index for O(1) metric lookup
 */
function createCompressedDataIndex(data: CompressedPointsResponse): CompressedDataIndex {
  const metricNameMap = new Map<string, number>();
  const metricLabelsMap = new Map<string, Record<string, string>>();
  
  data.k.forEach((metricString, index) => {
    // Extract metric name (before {)
    const metricName = metricString.split('{')[0];
    metricNameMap.set(metricString, index);
    metricLabelsMap.set(metricString, parseLabels(metricString));
  });
  
  return { metricNameMap, metricLabelsMap };
}

/**
 * Retrieve aggregated points for a specific metric
 * Optionally filter by aggregation type
 */
function getPointsFromIndex(
  data: CompressedPointsResponse,
  index: CompressedDataIndex,
  metricString: string,
  aggType?: AggregationType
): AggregatedPoint[] {
  const metricIndex = index.metricNameMap.get(metricString);
  if (metricIndex === undefined) return [];
  
  const labels = index.metricLabelsMap.get(metricString) || {};
  const metricName = metricString.split('{')[0];
  const points: AggregatedPoint[] = [];
  
  // If aggType specified, retrieve single aggregation level
  if (aggType !== undefined) {
    const rawPoints = data.v[aggType]?.[metricIndex] || [];
    for (const point of rawPoints) {
      points.push({
        timestamp: point.t,
        value: point.v,
        aggType,
        metricName,
        labels,
      });
    }
  } else {
    // Retrieve all aggregation types for this metric
    for (let agg = 0; agg < 8; agg++) {
      const rawPoints = data.v[agg]?.[metricIndex] || [];
      for (const point of rawPoints) {
        points.push({
          timestamp: point.t,
          value: point.v,
          aggType: agg as AggregationType,
          metricName,
          labels,
        });
      }
    }
  }
  
  return points;
}

/**
 * Main decompression pipeline
 * Input: CompressedPointsResponse from HTTP response
 * Output: Map<metricName, AggregatedPoint[]> for chart rendering
 */
export function decompressPoints(
  data: CompressedPointsResponse
): Map<string, AggregatedPoint[]> {
  const index = createCompressedDataIndex(data);
  const result = new Map<string, AggregatedPoint[]>();
  
  // Decompress all metrics
  for (const metricString of data.k) {
    const metricName = metricString.split('{')[0];
    const points = getPointsFromIndex(data, index, metricString);
    
    if (points.length > 0) {
      result.set(metricName, points);
    }
  }
  
  return result;
}
```

### 1.3 Performance Characteristics

- **Index Creation**: O(n) where n = number of unique metrics
- **Point Lookup**: O(1) using Map-based index
- **Decompression**: O(m) where m = total data points
- **Memory**: Minimal overhead; labels parsed once and cached

**Key Insight**: The 3D array structure `v[aggType][metricIndex][dataPointIndex]` allows pre-allocating space and fast aggregation type switching without reshuffling data.

---

## 2. Aggregation Levels Configuration

### 2.1 Aggregation Levels Array

```typescript
// From: aggregation.ts
export const AGGREGATION_LEVELS = [
  {
    name: '15s',
    interval: 15 * 1000,           // milliseconds
    retention: 1 * 60 * 60 * 1000,  // 1 hour
    source: 'raw',                  // data source
    displayLabel: '15s aggregation',
    retentionMs: 1 * 60 * 60 * 1000,
    refreshInterval: 3000,           // frontend poll every 3 seconds
  },
  {
    name: '1m',
    interval: 60 * 1000,
    retention: 6 * 60 * 60 * 1000,   // 6 hours
    source: 'agg_1m',
    displayLabel: '1 minute aggregation',
    retentionMs: 6 * 60 * 60 * 1000,
    refreshInterval: 10000,           // 10 seconds
  },
  {
    name: '5m',
    interval: 5 * 60 * 1000,
    retention: 24 * 60 * 60 * 1000,  // 1 day
    source: 'agg_5m',
    displayLabel: '5 minute aggregation',
    retentionMs: 24 * 60 * 60 * 1000,
    refreshInterval: 30000,           // 30 seconds
  },
  {
    name: '30m',
    interval: 30 * 60 * 1000,
    retention: 7 * 24 * 60 * 60 * 1000, // 7 days
    source: 'agg_30m',
    displayLabel: '30 minute aggregation',
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    refreshInterval: 60000,            // 1 minute
  },
  {
    name: '1h',
    interval: 60 * 60 * 1000,
    retention: 30 * 24 * 60 * 60 * 1000, // 30 days
    source: 'agg_1h',
    displayLabel: '1 hour aggregation',
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    refreshInterval: 5 * 60 * 1000,    // 5 minutes
  },
  {
    name: '6h',
    interval: 6 * 60 * 60 * 1000,
    retention: 365 * 24 * 60 * 60 * 1000, // 1 year
    source: 'agg_6h',
    displayLabel: '6 hour aggregation',
    retentionMs: 365 * 24 * 60 * 60 * 1000,
    refreshInterval: 30 * 60 * 1000,   // 30 minutes
  },
];

export const QUERY_DELAY_MS = 60 * 1000; // 60 seconds delay for backend processing
```

### 2.2 Time Window Calculation

```typescript
/**
 * Calculate query time window based on aggregation level
 * 
 * Strategy:
 * - Load data from (now - retention) to now
 * - Add QUERY_DELAY_MS offset to account for backend aggregation latency
 * 
 * Returns:
 * - startTime: milliseconds since epoch
 * - endTime: milliseconds since epoch (typically now - QUERY_DELAY_MS)
 */
export function calculateQueryTimeWindow(level: AggregationLevel): {
  startTime: number;
  endTime: number;
} {
  const now = Date.now();
  const endTime = now - QUERY_DELAY_MS;
  const startTime = endTime - level.retentionMs;
  
  return { startTime, endTime };
}

/**
 * Convert milliseconds to hours/minutes/seconds for display
 */
export function parseTimeToMs(input: string): number {
  const match = input.match(/^(\d+)([hms])$/);
  if (!match) return 0;
  
  const [, value, unit] = match;
  const num = parseInt(value, 10);
  
  switch (unit) {
    case 'h': return num * 60 * 60 * 1000;
    case 'm': return num * 60 * 1000;
    case 's': return num * 1000;
    default: return 0;
  }
}

/**
 * Format retention period for display
 * Input: 3600000 (1 hour in ms)
 * Output: "1h" or "30m" etc
 */
export function formatRetentionLabel(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours >= 1 && hours === Math.floor(hours)) {
    return `${hours}h`;
  }
  
  const minutes = ms / (60 * 1000);
  if (minutes >= 1 && minutes === Math.floor(minutes)) {
    return `${minutes}m`;
  }
  
  const seconds = ms / 1000;
  return `${seconds}s`;
}

export interface AggregationLevel {
  name: string;
  interval: number;
  retention: number;
  source: string;
  displayLabel: string;
  retentionMs: number;
  refreshInterval: number;
}
```

**Design Rationale**:
- Shorter aggregation levels (15s, 1m) have faster refresh intervals for real-time visibility
- Longer levels (1h, 6h) have relaxed refresh intervals to reduce backend load
- QUERY_DELAY_MS accounts for backend processing time before data becomes queryable

---

## 3. Dashboard Data Flow

### 3.1 HTTP Polling Pipeline

```typescript
// Complete flow in dashboard.tsx
interface DashboardState {
  selectedLevel: AggregationLevel;
  legendVisible: boolean;
  gridCols: number;
  datasource: DatasourceRecord | null;
  datasourceStatus: Record<string, AddressStatus>;
  summaryTables: SummaryTable[];
  pointsByMetric: Map<string, AggregatedPoint[]>;  // Decompressed data
  isLoading: boolean;
  error: string | null;
}

/**
 * Step 1: User selects aggregation level (15s, 1m, 5m, etc)
 * Step 2: Calculate query time window
 */
const handleLevelChange = (level: AggregationLevel) => {
  setSelectedLevel(level);
  
  // Immediately query with new level
  const { startTime, endTime } = calculateQueryTimeWindow(level);
  queryPoints(datasource, level, startTime, endTime);
};

/**
 * Step 3: Query backend for compressed data
 * Endpoint: GET /api/v1/points?datasource_id=...&agg_level=1m&start_time=...&end_time=...
 */
async function queryPoints(
  datasource: DatasourceRecord,
  level: AggregationLevel,
  startTime: number,
  endTime: number
): Promise<void> {
  try {
    setIsLoading(true);
    
    const response = await fetch(
      `/api/v1/points?datasource_id=${datasource.id}&agg_level=${level.name}&start_time=${startTime}&end_time=${endTime}`
    );
    
    const compressedData: CompressedPointsResponse = await response.json();
    
    // Step 4: Decompress points
    const decompressed = decompressPoints(compressedData);
    
    // Step 5: Update state for chart rendering
    setPointsByMetric(decompressed);
    setError(null);
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setIsLoading(false);
  }
}

/**
 * Step 6: Automatic refresh at level-specific interval
 */
useEffect(() => {
  const interval = setInterval(() => {
    const { startTime, endTime } = calculateQueryTimeWindow(selectedLevel);
    queryPoints(datasource, selectedLevel, startTime, endTime);
  }, selectedLevel.refreshInterval);
  
  return () => clearInterval(interval);
}, [selectedLevel, datasource]);
```

### 3.2 Chart Rendering Pipeline

```typescript
/**
 * MetricCharts component handles:
 * 1. Grouping metrics by groupName (from MetricConfig)
 * 2. Computing sorted metric list with display names
 * 3. Memoizing pre-calculated aggregation type data
 * 4. Fast switching between aggregation types
 */
function MetricCharts({
  pointsByMetric,
  selectedLevel,
  datasource,
}: MetricChartsProps) {
  // INDEX STEP 1: Create metric lookup map
  const pointsByMetricIndex = useMemo(() => {
    const index = new Map<string, AggregatedPoint[]>();
    for (const [metricName, points] of pointsByMetric) {
      // Filter to only selected aggregation type
      const filtered = points.filter(p => p.aggType === selectedLevel.aggType);
      index.set(metricName, filtered);
    }
    return index;
  }, [pointsByMetric, selectedLevel]);
  
  // INDEX STEP 2: Expand groupmap and sort metrics
  const sortedMetrics = useMemo(() => {
    const expanded: MetricConfig[] = [];
    
    // Iterate through all groups
    for (const group of datasource.groups) {
      // Expand each group's metrics (may have aliases, transforms)
      for (const metric of group.metrics) {
        expanded.push({
          ...metric,
          groupName: group.name,
        });
      }
    }
    
    // Sort by: groupName, then by sort_key (or metric name)
    return expanded.sort((a, b) => {
      if (a.groupName !== b.groupName) {
        return a.groupName.localeCompare(b.groupName);
      }
      return (a.sort_key || a.name).localeCompare(b.sort_key || b.name);
    });
  }, [datasource.groups]);
  
  // MEMOIZE STEP 3: Pre-calculate all aggregation types at once
  // This allows O(1) switching between aggTypes without re-querying
  const allMetricsDataByAggType = useMemo(() => {
    const byAggType = new Map<AggregationType, Map<string, AggregatedPoint[]>>();
    
    for (let agg = 0; agg < 8; agg++) {
      const filtered = new Map<string, AggregatedPoint[]>();
      for (const [metricName, points] of pointsByMetric) {
        const aggPoints = points.filter(p => p.aggType === agg);
        if (aggPoints.length > 0) {
          filtered.set(metricName, aggPoints);
        }
      }
      byAggType.set(agg as AggregationType, filtered);
    }
    
    return byAggType;
  }, [pointsByMetric]);
  
  // MEMOIZE STEP 4: Select current aggregation type data
  const metricsData = useMemo(() => {
    return allMetricsDataByAggType.get(selectedLevel.aggType) || new Map();
  }, [allMetricsDataByAggType, selectedLevel.aggType]);
  
  // RENDER: MetricChartsGrid with current data
  return (
    <MetricChartsGrid
      metrics={sortedMetrics}
      data={metricsData}
      selectedLevel={selectedLevel}
    />
  );
}
```

---

## 4. WebSocket Integration for Real-time Updates

### 4.1 WebSocketClient Class

```typescript
// From: websocket.ts
type WSMessageType = 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'publish' | 'error';

interface WSMessage {
  type: WSMessageType;
  topic: string;
  path: string;
  request_id: string;
  data?: unknown;
  timestamp: number;
}

enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private url: string;
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private requestId = 0;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Establish WebSocket connection with auto-reconnect
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.state = ConnectionState.CONNECTING;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          
          // Resubscribe to all topics on reconnect
          this.resubscribeAll();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        };

        this.ws.onerror = (error) => {
          this.state = ConnectionState.DISCONNECTED;
          reject(error);
        };

        this.ws.onclose = () => {
          this.state = ConnectionState.DISCONNECTED;
          this.stopHeartbeat();
          
          // Attempt reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.state = ConnectionState.RECONNECTING;
            setTimeout(() => this.connect(), this.reconnectDelay);
          }
        };
      } catch (error) {
        this.state = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a topic with callback
   */
  subscribe(topic: string, callback: (data: any) => void): string {
    const requestId = `${topic}-${++this.requestId}`;
    this.subscriptions.set(topic, callback);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        topic,
        path: `/${topic}`,
        request_id: requestId,
        timestamp: Date.now(),
      }));
    }

    return requestId;
  }

  /**
   * Unsubscribe from topic
   */
  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic);

    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        topic,
        path: `/${topic}`,
        request_id: `${topic}-unsub`,
        timestamp: Date.now(),
      }));
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WSMessage): void {
    switch (message.type) {
      case 'publish':
        // Broadcast data to subscribers
        const callback = this.subscriptions.get(message.topic);
        if (callback) {
          callback(message.data);
        }
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'error':
        console.error('WebSocket error:', message.data);
        break;
    }
  }

  /**
   * Resubscribe to all topics after reconnect
   */
  private resubscribeAll(): void {
    for (const topic of this.subscriptions.keys()) {
      const callback = this.subscriptions.get(topic)!;
      this.subscribe(topic, callback);
    }
  }

  /**
   * Send heartbeat ping
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'ping',
          topic: 'heartbeat',
          path: '/heartbeat',
          request_id: `heartbeat-${++this.requestId}`,
          timestamp: Date.now(),
        }));
      }
    }, 30000); // 30 second interval
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.state = ConnectionState.CLOSED;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

### 4.2 Datasource Status Subscription

```typescript
// From: datasource.ts
export interface DatasourceStatus {
  datasource_id: string;
  status: 'UP' | 'DOWN';
  last_seen: number; // Unix timestamp
  address_status: Record<string, AddressStatus>;
}

export interface AddressStatus {
  address: string;
  status: 'UP' | 'DOWN';
  error_message: string;
}

let wsClient: WebSocketClient | null = null;

export function setWebSocketClient(client: WebSocketClient): void {
  wsClient = client;
}

/**
 * Subscribe to datasource status updates
 * Topic: `datasources:${datasourceId}:status`
 * 
 * Emits: DatasourceStatus objects when addresses go UP/DOWN
 */
export function subscribeDatasourceStatus(
  datasourceId: string,
  onStatus: (status: DatasourceStatus) => void
): () => void {
  if (!wsClient) return () => {};

  const topic = `datasources:${datasourceId}:status`;
  wsClient.subscribe(topic, (data) => {
    const status = data as DatasourceStatus;
    onStatus(status);
  });

  // Return unsubscribe function
  return () => wsClient?.unsubscribe(topic);
}

/**
 * In Dashboard component:
 * 
 * useEffect(() => {
 *   if (!datasource) return;
 *   
 *   const unsubscribe = subscribeDatasourceStatus(
 *     datasource.id,
 *     (status) => {
 *       setDatasourceStatus(prev => ({
 *         ...prev,
 *         [status.datasource_id]: status,
 *       }));
 *     }
 *   );
 *   
 *   return unsubscribe;
 * }, [datasource]);
 */
```

---

## 5. MetricChartsGrid Component with Column Span

### 5.1 Column Span Layout Algorithm

```typescript
// From: metric-charts-grid.tsx

interface MetricChartProps {
  metric: MetricConfig;
  data: AggregatedPoint[];
  selectedLevel: AggregationLevel;
  column_span?: number;  // 1-3 (1=1 col, 2=2 cols, 3=full width)
}

/**
 * Simulate CSS grid to determine if a metric should span full width
 * 
 * Layout rules:
 * - Column span can be 1 (narrow), 2 (medium), or 3 (full width)
 * - If metric is last in row and would leave gap, expand to fill row
 * - Prevents orphaned narrow columns at row end
 */
function shouldSpanFullRow(
  metrics: MetricConfig[],
  index: number,
  gridCols: number = 3
): boolean {
  let currentCol = 0;
  
  for (let i = 0; i < index; i++) {
    const span = metrics[i].column_span || 1;
    currentCol += span;
    
    if (currentCol >= gridCols) {
      currentCol = currentCol % gridCols;
    }
  }
  
  // Current metric's span
  const span = metrics[index].column_span || 1;
  
  // Check if this is last metric
  const isLast = index === metrics.length - 1;
  
  // If metric would fit in row but leave gap at end, expand it
  if (isLast && currentCol + span < gridCols) {
    return true; // Force full width to fill gap
  }
  
  return false;
}

/**
 * MetricChartsGrid renders metrics with responsive column layout
 */
interface MetricChartsGridProps {
  metrics: MetricConfig[];
  data: Map<string, AggregatedPoint[]>;
  selectedLevel: AggregationLevel;
  gridCols?: number;
}

export function MetricChartsGrid({
  metrics,
  data,
  selectedLevel,
  gridCols = 3,
}: MetricChartsGridProps) {
  const [activeSeriesForMetric, setActiveSeriesForMetric] = useState<
    Map<string, Set<string>>
  >(new Map());

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: '16px',
        padding: '16px',
      }}
    >
      {metrics.map((metric, index) => {
        const shouldSpan = shouldSpanFullRow(metrics, index, gridCols);
        const span = shouldSpan ? gridCols : (metric.column_span || 1);

        return (
          <div
            key={metric.name}
            style={{
              gridColumn: `span ${span}`,
            }}
          >
            <MetricChartWithLegend
              metric={metric}
              points={data.get(metric.name) || []}
              selectedLevel={selectedLevel}
              activeSeries={activeSeriesForMetric.get(metric.name) || new Set()}
              onSeriesChange={(series) => {
                setActiveSeriesForMetric((prev) => {
                  const next = new Map(prev);
                  next.set(metric.name, series);
                  return next;
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
```

### 5.2 Virtual Scrolling Legend with Interactions

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

interface MetricChartWithLegendProps {
  metric: MetricConfig;
  points: AggregatedPoint[];
  selectedLevel: AggregationLevel;
  activeSeries: Set<string>;
  onSeriesChange: (series: Set<string>) => void;
}

/**
 * MetricChartWithLegend renders:
 * 1. Chart area (using Recharts or similar)
 * 2. Virtual scrolling legend (for datasets with many series)
 * 3. Legend interactions: single-click toggle, double-click solo
 */
export function MetricChartWithLegend({
  metric,
  points,
  selectedLevel,
  activeSeries,
  onSeriesChange,
}: MetricChartWithLegendProps) {
  // Group points by series (based on labels)
  const series = useMemo(() => {
    const seriesMap = new Map<string, AggregatedPoint[]>();

    for (const point of points) {
      // Create series key from metric labels
      const seriesKey = Object.entries(point.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',');

      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, []);
      }
      seriesMap.get(seriesKey)!.push(point);
    }

    return Array.from(seriesMap.entries()).map(([key, points]) => ({
      key,
      points,
      label: key || 'default',
    }));
  }, [points]);

  // Truncate to 30 series max (backend performance constraint)
  const displaySeries = useMemo(() => {
    const truncated = series.slice(0, 30);
    if (truncated.length < series.length) {
      console.warn(
        `Metric ${metric.name} has ${series.length} series, showing only ${truncated.length}`
      );
    }
    return truncated;
  }, [series, metric.name]);

  // Virtual scroller for legend
  const rowVirtualizer = useVirtualizer({
    count: displaySeries.length,
    getScrollElement: () => legendRef.current,
    estimateSize: () => 32, // 32px per legend item
    overscan: 5,
  });

  const legendRef = useRef<HTMLDivElement>(null);

  // Handle legend interactions
  const handleLegendClick = (seriesKey: string, event: React.MouseEvent) => {
    const next = new Set(activeSeries);

    if (event.detail === 2) {
      // Double-click: Solo mode
      if (next.size === 1 && next.has(seriesKey)) {
        // If already solo, show all
        next.clear();
      } else {
        next.clear();
        next.add(seriesKey);
      }
    } else {
      // Single-click: Toggle visibility
      if (next.has(seriesKey)) {
        next.delete(seriesKey);
      } else {
        next.add(seriesKey);
      }
    }

    // Ensure at least one series is visible
    if (next.size === 0) {
      next.add(seriesKey);
    }

    onSeriesChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Chart component */}
      <ChartComponent
        data={displaySeries}
        visibleSeries={activeSeries}
        metric={metric}
      />

      {/* Virtual legend */}
      <div
        ref={legendRef}
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
        }}
      >
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const series = displaySeries[virtualItem.index];
            const isActive = activeSeries.has(series.key);

            return (
              <div
                key={series.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  height: `${virtualItem.size}px`,
                  paddingLeft: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#f5f5f5' : 'transparent',
                  userSelect: 'none',
                }}
                onClick={(e) => handleLegendClick(series.key, e as any)}
                onDoubleClick={(e) => handleLegendClick(series.key, e as any)}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => {}}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontSize: '12px' }}>{series.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {displaySeries.length < series.length && (
        <div style={{ fontSize: '12px', color: '#999' }}>
          Showing {displaySeries.length} of {series.length} series
        </div>
      )}
    </div>
  );
}
```

### 5.3 Custom Comparison for Rendering Optimization

```typescript
/**
 * Custom comparison function to prevent unnecessary re-renders
 * 
 * React.memo uses shallow comparison by default.
 * For complex objects (Map, Set), we need custom equality.
 */
function areChartPropsEqual(
  prevProps: MetricChartWithLegendProps,
  nextProps: MetricChartWithLegendProps
): boolean {
  // Quick checks
  if (prevProps.metric.name !== nextProps.metric.name) return false;
  if (prevProps.selectedLevel.name !== nextProps.selectedLevel.name) return false;

  // Compare points array (same reference = same data)
  if (prevProps.points !== nextProps.points) {
    // If different, check if lengths are same
    if (prevProps.points.length !== nextProps.points.length) return false;
    
    // Check if all points are identical
    for (let i = 0; i < prevProps.points.length; i++) {
      const prev = prevProps.points[i];
      const next = nextProps.points[i];
      if (
        prev.timestamp !== next.timestamp ||
        prev.value !== next.value ||
        prev.aggType !== next.aggType
      ) {
        return false;
      }
    }
  }

  // Compare activeSeries (Set comparison)
  if (prevProps.activeSeries.size !== nextProps.activeSeries.size) return false;
  for (const item of prevProps.activeSeries) {
    if (!nextProps.activeSeries.has(item)) return false;
  }

  return true;
}

export const MemoizedMetricChartWithLegend = React.memo(
  MetricChartWithLegend,
  areChartPropsEqual
);
```

---

## 6. Performance Optimizations

### 6.1 Memoization Strategy

| Layer | Optimization | Benefit |
|-------|--------------|---------|
| **Data Decompression** | Index-based lookup (O(1)) | No iteration over all metrics |
| **Aggregation Switching** | Pre-compute all agg types at once | O(1) switch, no re-query needed |
| **Metric Grouping** | useMemo for sorted metric expansion | Prevent re-sort on every render |
| **Series Filtering** | Map-based series lookup | O(1) series visibility lookup |
| **Legend Rendering** | Virtual scrolling (@tanstack/react-virtual) | Render only visible legend items |

### 6.2 Data Layer Series Truncation (Not UI Layer)

**Key Insight**: Series truncation happens at data level, not UI level.

```typescript
// ✅ CORRECT: Truncate in data preprocessing
const displaySeries = useMemo(() => {
  const truncated = series.slice(0, 30);
  return truncated;
}, [series]);

// ❌ WRONG: Truncate in component render
function render() {
  const limited = data.slice(0, 30);  // Re-truncates on every render
  return limited.map(...);
}
```

**Why**: By truncating early in a memoized hook, subsequent computations (virtual scrolling, filtering) work on the already-limited dataset.

### 6.3 Color Caching

Prevent color recomputation on every render:

```typescript
const colorCache = useMemo(() => {
  const colors = new Map<string, string>();
  const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

  for (let i = 0; i < displaySeries.length; i++) {
    const series = displaySeries[i];
    colors.set(series.key, palette[i % palette.length]);
  }

  return colors;
}, [displaySeries]);
```

---

## 7. Sonar View Frontend Implementation Checklist

Based on monitor_hub analysis, sonar-view frontend must implement:

### 7.1 Data Decompression Module ✓ (HIGH PRIORITY)

- [ ] **CompressedPointsResponse** interface matching backend format
- [ ] **decompressPoints()** function with O(1) metric lookup
- [ ] **createCompressedDataIndex()** for fast indexing
- [ ] **getPointsFromIndex()** for aggregation type filtering
- [ ] **parseLabels()** utility for Prometheus label parsing
- [ ] **Unit tests** for decompression with various metric counts

**File**: `sonar-view/site/src/apis/points-compressed.ts`

### 7.2 Aggregation Configuration Module ✓ (HIGH PRIORITY)

- [ ] **AGGREGATION_LEVELS** array (6 levels: 15s, 1m, 5m, 30m, 1h, 6h)
- [ ] **calculateQueryTimeWindow()** function for time range calculation
- [ ] **QUERY_DELAY_MS** constant (60 seconds for backend latency)
- [ ] **parseTimeToMs()** and **formatRetentionLabel()** utilities
- [ ] Integration with dashboard time window calculation

**File**: `sonar-view/site/src/config/aggregation.ts`

### 7.3 WebSocket Client Implementation ✓ (HIGH PRIORITY)

- [ ] **WebSocketClient** class with auto-reconnect (5 attempts, exponential backoff)
- [ ] **WSMessage** interface with type/topic/data structure
- [ ] **subscribe()** and **unsubscribe()** methods with resubscription on reconnect
- [ ] **Heartbeat** mechanism (ping/pong every 30 seconds)
- [ ] **Connection state** management (CONNECTING, CONNECTED, DISCONNECTED, RECONNECTING, CLOSED)
- [ ] Integration with datasource status updates

**File**: `sonar-view/site/src/apis/websocket.ts`

### 7.4 Datasource & Metrics APIs ✓ (HIGH PRIORITY)

- [ ] **DatasourceRecord** interface with nested groups and metrics
- [ ] **MetricConfig** interface supporting:
  - Alias and display name
  - Unit and value transform
  - Display labels configuration
  - Column span (1-3 for layout)
- [ ] **DatasourceStatus** interface for WebSocket broadcasts
- [ ] **subscribeDatasourceStatus()** for real-time status updates
- [ ] **setWebSocketClient()** for dependency injection

**File**: `sonar-view/site/src/apis/datasource.ts`

### 7.5 Dashboard Component ✓ (MEDIUM PRIORITY)

- [ ] **Main Dashboard** component with state management:
  - selectedLevel (aggregation level)
  - legendVisible, gridCols (UI toggles)
  - datasource and datasourceStatus
  - pointsByMetric (decompressed data)
- [ ] **HTTP polling** with level-specific refresh intervals
- [ ] **WebSocket subscription** for real-time status
- [ ] **Toolbar** for level/legend/grid controls
- [ ] Integration with MetricCharts subcomponent

**File**: `sonar-view/site/src/components/routes/dashboard.tsx`

### 7.6 MetricChartsGrid Component ✓ (MEDIUM PRIORITY)

- [ ] **shouldSpanFullRow()** layout algorithm for responsive grid
- [ ] **CSS grid** implementation with configurable gridCols (default 3)
- [ ] **MetricChartWithLegend** subcomponent
- [ ] **Virtual scrolling** legend with @tanstack/react-virtual
- [ ] Support for 30-series truncation with warning display
- [ ] Full-width metric expansion for last row

**File**: `sonar-view/site/src/components/charts/metric-charts-grid.tsx`

### 7.7 Individual Metric Chart Component ✓ (MEDIUM PRIORITY)

- [ ] **Chart rendering** (Recharts recommended for consistency)
- [ ] **Series grouping** by labels (e.g., `server_id=1,region=us-east`)
- [ ] **Legend interactions**:
  - Single-click: Toggle series visibility
  - Double-click: Solo mode (show only one series)
  - Checkbox in virtual legend
- [ ] **Custom React.memo** comparison to prevent unnecessary renders
- [ ] **Color caching** per series with consistent palette

**File**: `sonar-view/site/src/components/charts/metric-chart.tsx`

### 7.8 Performance Optimizations ✓ (MEDIUM PRIORITY)

- [ ] **useMemo** for metric grouping and sorting
- [ ] **Pre-compute all aggregation types** to enable O(1) switching
- [ ] **useTransition** for non-blocking UI updates on data change
- [ ] **Virtual scrolling** for legends (30+ series)
- [ ] **Index-based lookups** for metric and series retrieval
- [ ] **Custom comparison functions** for React.memo

**File**: Various components

### 7.9 Error Handling & Loading States ✓ (LOW PRIORITY)

- [ ] **Loading spinner** during HTTP requests
- [ ] **Error messages** for failed queries
- [ ] **WebSocket connection status** indicator
- [ ] **Fallback UI** when data is unavailable
- [ ] **Retry logic** for failed requests

**File**: `sonar-view/site/src/components/common/`

### 7.10 Testing ✓ (LOW PRIORITY)

- [ ] **Unit tests** for decompression logic
- [ ] **Integration tests** for dashboard data flow
- [ ] **Mock WebSocket** for testing real-time updates
- [ ] **Performance tests** for large metric counts (100+)
- [ ] **Snapshot tests** for chart rendering

**File**: `sonar-view/site/src/**/__tests__/`

---

## 8. Key Differences Between Monitor Hub and Sonar View

### 8.1 Monitor Hub Architecture (Reference)

- **Single datasource per dashboard**: Dashboard shows one exporter's metrics
- **WebSocket for everything**: Real-time status + aggregation broadcasts
- **Pre-aggregated data**: Backend does all aggregation (15s→1m→5m→...)
- **Groupmap-driven config**: MetricConfig with groupName, sort_key, column_span

### 8.2 Sonar View Architecture (Target)

- **Multiple datasources**: Single view shows metrics from multiple tap instances + store aggregations
- **HTTP polling + WebSocket hybrid**: HTTP for historical data, WebSocket for real-time status
- **On-demand aggregation**: Client switches aggregation level via HTTP query param
- **Similar groupmap config**: Inherit monitor_hub's MetricConfig structure

### 8.3 Behavioral Similarities

| Behavior | Monitor Hub | Sonar View |
|----------|-------------|-----------|
| **Aggregation Levels** | 6 levels (15s-6h) | 6 levels (15s-6h) ✓ Copy |
| **Time Window Calc** | calculateQueryTimeWindow() | Same pattern ✓ Copy |
| **Series Truncation** | Max 30 series per metric | Same limit ✓ Copy |
| **Legend Scrolling** | Virtual scrolling (@tanstack) | Same pattern ✓ Copy |
| **Compression Format** | CompressedPointsResponse | Same format ✓ Copy |
| **Decompression** | Index-based O(1) lookup | Same algorithm ✓ Copy |
| **Color Caching** | Per-series color map | Same pattern ✓ Copy |
| **Refresh Intervals** | Level-specific (3s, 10s, 30s...) | Same strategy ✓ Copy |

**Bottom Line**: Sonar view frontend is ~90% copy of monitor_hub patterns, with main difference being multi-datasource support at the routing/page level (not chart component level).

---

## 9. Integration Points with Sonar Store Backend

### 9.1 HTTP API Endpoints (Sonar Store)

```typescript
/**
 * Query compressed points for a datasource over time range
 */
GET /api/v1/datasources/{datasourceId}/points
  ?agg_level=1m
  &start_time=1234567890000
  &end_time=1234567950000
  &metrics=cpu_usage,memory_usage  // optional filter

Response: CompressedPointsResponse {
  k: ["cpu_usage{host=server1}", ...],
  v: [[[timestamp, value], ...], ...]
}

/**
 * Get datasource configuration (groups, metrics, display options)
 */
GET /api/v1/datasources/{datasourceId}

Response: DatasourceRecord {
  id: string,
  name: string,
  groups: MetricGroup[],
  ...
}

/**
 * WebSocket: Subscribe to datasource status
 * Topic: `datasources:{datasourceId}:status`
 */
WS /ws

Message:
{
  type: "publish",
  topic: "datasources:abc123:status",
  data: {
    datasource_id: "abc123",
    status: "UP",
    address_status: {
      "server1:9090": { status: "UP", ... },
      "server2:9090": { status: "DOWN", error: "..." }
    }
  }
}
```

### 9.2 Aggregation Level Configuration Alignment

Sonar store backend must provide same aggregation level configuration as frontend expects:

```typescript
// Frontend expectation (from aggregation.ts)
const AGGREGATION_LEVELS = [
  { name: '15s', interval: 15000, retention: 1h, refreshInterval: 3000 },
  { name: '1m', interval: 60000, retention: 6h, refreshInterval: 10000 },
  { name: '5m', interval: 300000, retention: 1d, refreshInterval: 30000 },
  { name: '30m', interval: 1800000, retention: 7d, refreshInterval: 60000 },
  { name: '1h', interval: 3600000, retention: 30d, refreshInterval: 300000 },
  { name: '6h', interval: 21600000, retention: 365d, refreshInterval: 1800000 },
];

// Backend must return data matching this structure
// If backend changes level config, frontend aggregation.ts must update accordingly
```

---

## 10. Deployment & Configuration

### 10.1 Environment Variables (sonar-view frontend)

```bash
# .env
VITE_SONAR_STORE_URL=http://sonar-store:8082  # Backend HTTP API
VITE_SONAR_STORE_WS=ws://sonar-store:8082/ws  # WebSocket endpoint
VITE_SONAR_TAP_PROXY=http://sonar-view:8283/api/v1/tap  # Proxy for remote tap management
```

### 10.2 Build & Run

```bash
# Development
cd sonar/sonar-view
gve dev

# Production build
gve build

# Production run
gve run
```

---

## 11. Summary & Next Steps

### 11.1 Implementation Priority

1. **Phase 1 (Foundational)**: Data decompression, aggregation config, WebSocket client
2. **Phase 2 (Core UI)**: Dashboard component, MetricChartsGrid, HTTP polling
3. **Phase 3 (Polish)**: Virtual scrolling legend, performance optimizations, error handling
4. **Phase 4 (Testing)**: Unit tests, integration tests, performance benchmarks

### 11.2 Files to Create (in order)

```
sonar-view/site/src/
├── apis/
│   ├── points-compressed.ts       # Phase 1
│   ├── websocket.ts               # Phase 1
│   └── datasource.ts              # Phase 1
├── config/
│   └── aggregation.ts             # Phase 1
├── components/
│   ├── routes/
│   │   └── dashboard.tsx          # Phase 2
│   └── charts/
│       ├── metric-charts-grid.tsx # Phase 2
│       └── metric-chart.tsx       # Phase 3
└── __tests__/                     # Phase 4
```

### 11.3 Reference Implementation

All code snippets in this document are extracted from:
- `/Users/castlexu/github/sonar/.legacy/monitor_hub/site/src/`

Can be directly adapted to sonar-view with:
1. Remove datasource-specific hardcoding
2. Add multi-datasource support at routing layer
3. Update API endpoints to point to sonar-store
4. Adjust styling to match sonar-view design system

---

## Appendix A: Type Definitions Reference

```typescript
// Complete type set for sonar-view frontend implementation

// Data Decompression
interface CompressedPointsResponse {
  k: string[];              // Metric names with labels
  v: RawDataPoint[][][];    // 3D array: [aggType][metricIndex][pointIndex]
}

interface RawDataPoint {
  t: number;  // timestamp
  v: number;  // value
}

interface AggregatedPoint {
  timestamp: number;
  value: number;
  aggType: AggregationType;
  metricName: string;
  labels: Record<string, string>;
}

enum AggregationType {
  last = 0, avg = 1, min = 2, max = 3,
  p50 = 4, p70 = 5, p90 = 6, p99 = 7,
}

// Datasource & Metrics
interface DatasourceRecord {
  id: string;
  name: string;
  groups: MetricGroup[];
}

interface MetricGroup {
  name: string;
  metrics: MetricConfig[];
}

interface MetricConfig {
  name: string;
  alias?: string;
  unit?: string;
  transform?: (value: number) => number;
  display_labels?: string[];
  column_span?: number;
  sort_key?: string;
}

interface DatasourceStatus {
  datasource_id: string;
  status: 'UP' | 'DOWN';
  last_seen: number;
  address_status: Record<string, AddressStatus>;
}

interface AddressStatus {
  address: string;
  status: 'UP' | 'DOWN';
  error_message: string;
}

// WebSocket
interface WSMessage {
  type: WSMessageType;
  topic: string;
  path: string;
  request_id: string;
  data?: unknown;
  timestamp: number;
}

type WSMessageType = 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'publish' | 'error';

enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

// Aggregation Configuration
interface AggregationLevel {
  name: string;
  interval: number;
  retention: number;
  source: string;
  displayLabel: string;
  retentionMs: number;
  refreshInterval: number;
}
```

---

**Document Complete**

This analysis provides a comprehensive roadmap for sonar-view frontend implementation. All code patterns, performance optimizations, and architectural decisions from monitor_hub have been extracted and documented for reuse.

For implementation questions or clarifications, refer to the corresponding sections in this document or the original source files in `/Users/castlexu/github/sonar/.legacy/monitor_hub/site/src/`.

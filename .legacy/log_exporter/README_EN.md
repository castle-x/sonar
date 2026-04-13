### Log Exporter - Log Monitoring Tool for Performance Testing

#### Overview

Log Exporter is a specialized log collection and monitoring tool designed for performance testing scenarios. It extracts key performance metrics from game server logs in real-time and pushes them to monitoring platforms, enabling testing teams to identify performance issues promptly.

#### Core Features

##### 🔍 1. Intelligent Log Discovery
- **Process-Associated Monitoring**: Automatically discovers log file paths from process command-line arguments and dynamically tracks process log outputs
- **File/Directory Monitoring**: Supports direct log file path specification or wildcard patterns to monitor multiple log files
- **Process Label Injection**: Automatically injects process PID, startup parameters, and other information into monitoring labels, establishing correlation between processes and log data

##### 📊 2. Flexible Metric Extraction
- **Regex Matching**: Extracts key metric values from log content using regular expressions
- **Timestamp Parsing**: Supports custom timestamp formats for precise metric timing
- **Sampling Density Control**: Configurable data sampling intervals to prevent excessive data density

##### 🚀 3. Real-time Data Push
- **PushGateway Integration**: Pushes collected metrics to PushGateway for full monitoring system integration
- **Batch Reporting**: Supports buffering and batch reporting to improve push efficiency
- **Global Labels**: Configurable cluster, region, and other global labels for data classification and querying

##### ⚡ 4. High-Performance Design
- **Real-time Listening**: File system event-based monitoring for real-time log change response
- **Memory Efficient**: Retains only necessary metric data to avoid excessive memory usage
- **Graceful Shutdown**: Supports signal handling to ensure data integrity during normal process termination

#### Typical Use Cases

##### Game Server Performance Testing
Monitor critical performance metrics of game servers during load testing:
- **FPS Monitoring**: Real-time collection of server average FPS, low FPS events, etc.
- **Player Load**: Track online player count and server load status
- **Anomaly Detection**: Timely identification of performance warnings and abnormal logs

##### Multi-Process Service Monitoring
Automatically discover and monitor logs from multiple service processes:
- Filter target processes via command-line parameters
- Automatically generate independent monitoring metrics for each process
- Dynamically detect process startup and shutdown, automatically adjusting monitoring list

##### Performance Test Data Collection
Real-time collection of key data during performance test execution:
- Flexible sampling density configuration to balance data completeness and system overhead
- Multi-dimensional labels for analysis by scenario, region, cluster, etc.
- Deep integration with monitoring platforms for automated alerting and visualization

#### Quick Start

##### Configuration Example
```yaml
log_config:
  # Get log path from process command-line arguments
  - name: "GameServerMonitor"
    enabled: true
    rules:
      - name: "GameServer"
        cmdlines: ["--config", "!debug"]
        log_path_pattern: "-ABSLOG=(.+\\.log)"
    
    metrics:
      - name: "avg_fps"
        pattern: "AverageFps:(\\d+)"
        value: "$1"
        density: 15  # Sample every 15 seconds

push_gateway:
  app_id: "pressure_test"
  enabled: true
  host: "http://pushgateway:8082"
  report_interval: 10
  labels:
    cluster: "test-cluster"
    region: "beijing"
```

##### Start Service
```bash
./log_exporter -c config.yaml
```

#### Technical Highlights

- **Language**: Go 1.23, high-performance and low-overhead
- **Architecture**: Resident process, event-driven
- **Deployment**: Single binary deployment with no external dependencies
- **Configuration**: YAML configuration file, simple and intuitive

#### Monitoring Metrics Examples

Log Exporter can extract various performance metrics from logs:

| Metric Type | Example | Description |
|------------|---------|-------------|
| Server FPS | avg_fps, slow_fps | Core game server performance metrics |
| Online Players | online_player | Server load status |
| Error Count | error_count | Abnormal log statistics |
| Response Time | response_time | Request processing latency |

#### Integration in Testing Ecosystem

Log Exporter serves as a crucial component in the performance testing ecosystem, working in coordination with other tools:

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│ Game Server │ ───→ │ Log Exporter │ ───→ │ PushGateway │
│  Log Files  │       │  Real-time   │       │  Data Push  │
└─────────────┘       │  Collection  │       └─────────────┘
                      └──────────────┘              │
                                                    ↓
                                           ┌─────────────┐
                                           │  Monitoring │
                                           │  Platform   │
                                           └─────────────┘
```

#### Summary

Log Exporter provides a complete log monitoring solution that helps testing teams during performance testing:
- ✅ Real-time insights into server performance status
- ✅ Quick identification of performance bottlenecks and anomalies
- ✅ Automated collection and archival of test data
- ✅ No need to modify the system under test

With Log Exporter, testing teams can focus on the performance testing itself without worrying about monitoring data collection and processing.


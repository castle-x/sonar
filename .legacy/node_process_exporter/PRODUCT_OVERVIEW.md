### Node Process Exporter - Performance Testing Monitoring System

#### Product Overview

Node Process Exporter is a lightweight distributed monitoring data collector specifically designed for performance testing ecosystems. It collects real-time performance metrics at both node and process levels and pushes data to PushGateway, providing comprehensive monitoring data support for stress testing analysis.

#### Core Features

#### 📊 Dual-Layer Monitoring Architecture

##### Node-Level Monitoring (Node Exporter)
- **System Resource Monitoring**: Comprehensive collection of node-level system performance metrics
  - 💻 CPU utilization and load
  - 🧠 Memory usage (total, used, available)
  - 🌐 Network traffic statistics (inbound/outbound)

##### Process-Level Monitoring (Process Exporter)
- **Fine-Grained Process Monitoring**: Detailed runtime metrics for specific processes
  - ⚡ Process-level CPU utilization
  - 💾 Process memory consumption (RSS, VMS)
  - 📡 Process network I/O statistics
- **Dynamic Process Discovery**: Automatically discover and monitor processes matching defined rules
- **Intelligent Label Extraction**: Extract business labels from process command-line arguments

#### 🎯 Flexible Process Matching Mechanism

Supports multiple process identification methods:
- **Direct PID Matching**: Precise monitoring via process ID
- **Command-Line Argument Filtering**: Supports both positive and negative matching rules
  - ✅ Positive matching: `"--config"` matches processes containing this parameter
  - ❌ Negative matching: `"!seed"` excludes processes containing this keyword

#### 🏷️ Powerful Label Extraction Capabilities

Automatically extract identification information from process command lines, supporting two extraction modes:

###### Split Extraction
Split command line by specified delimiter and extract values at specified positions:
```yaml
type: "split"
sep: " "
labels:
  ds_type: $1  # Extract 1st parameter as ds_type label
```

###### Regex Extraction
Use regular expressions to match and extract values with specific patterns:
```yaml
type: "regex"
pattern: "--id=(\\w+)"
labels:
  id: $1  # Extract value of --id parameter
```

#### 🚀 Reliable Data Push Mechanism

- **Batch Pushing**: Supports buffer aggregation to reduce network overhead
- **Configurable Push Interval**: Flexibly adjust reporting frequency based on testing needs
- **Timeout Control**: Prevents blocking caused by network anomalies
- **Global Labels**: Add cluster, region, and other global identifiers to all metrics
- **Local Log Output**: Optional metric log printing for debugging

#### ⚙️ High-Performance Collection Engine

- **Scheduled Collection**: Supports second-level collection interval configuration
- **Concurrent Processing**: Asynchronous collection and pushing, non-blocking
- **Dynamic Refresh**: Configurable process list refresh interval
- **Graceful Shutdown**: Signal handling ensures data integrity

#### Use Cases

##### Performance Testing Monitoring
- Real-time monitoring of resource consumption on test machines and test processes
- Identify performance metrics of different test tasks through labels
- Provide system-level data support for test result analysis

##### Multi-Instance Service Monitoring
- Dynamically discover and monitor multiple instances of the same service
- Automatically extract instance ID, configuration type, and other identification information
- Support fine-grained instance-level performance comparison

##### Distributed System Observability
- Unified collection of system and process metrics across multiple nodes
- Distinguish different clusters and regions through global labels
- Centralized push to PushGateway for aggregated analysis

#### Technical Highlights

- **Language**: Built with Go for high performance
- **Lightweight Deployment**: Single binary with no external dependencies
- **Configuration-Driven**: Supports YAML/JSON configuration files
- **CLI-Friendly**: Built on Cobra framework, easy to integrate and use
- **Cloud-Native Ready**: Design principles align with Prometheus ecosystem standards

#### Quick Start

##### Configuration Example
```yaml
# Collection interval
step: 3

# Push gateway configuration
push_gateway:
  app_id: "my_stress_test"
  enabled: true
  host: "http://pushgateway:8082"
  report_interval: 10
  labels:
    cluster: "test-cluster"
    region: "beijing"

# Process monitoring
process_exporter:
  enabled: true
  dynamic_interval: 15  # Refresh process list every 15 seconds
  rules:
    - name: "TestServer"
      cmdlines:
        - "--config"
        - "!seed"
      extracts:
        - type: "regex"
          pattern: "--id=(\\w+)"
          labels:
            server_id: $1

# Node monitoring
node_exporter:
  enabled: true
```

##### Launch Command
```bash
./node_process_exporter -c config.yaml
```

#### Typical Performance Testing Architecture

```
┌─────────────────────────────────────────────┐
│    Performance Testing Environment          │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  Test Node 1 │  │  Test Node 2 │  ...   │
│  │  + Exporter  │  │  + Exporter  │        │
│  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                 │
│         └──────────┬───────┘                 │
└────────────────────┼─────────────────────────┘
                     │ Metrics Push
                     ▼
          ┌──────────────────┐
          │  PushGateway     │
          │  (Aggregation)   │
          └─────────┬────────┘
                    │
                    ▼
          ┌──────────────────┐
          │  Prometheus      │
          │ (Time Series DB) │
          └─────────┬────────┘
                    │
                    ▼
          ┌──────────────────┐
          │  Grafana         │
          │ (Visualization)  │
          └──────────────────┘
```

#### Summary

As the data collection infrastructure of the performance testing ecosystem, Node Process Exporter provides fine-grained, multi-dimensional monitoring data for stress testing analysis through flexible configuration and powerful label extraction capabilities. It seamlessly integrates with components such as PushGateway, Prometheus, and Grafana to build a complete monitoring loop for performance testing, helping to improve testing efficiency and facilitate problem diagnosis.


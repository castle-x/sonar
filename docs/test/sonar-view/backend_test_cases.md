# Backend Test Cases

## pkg/scoring/calculator_test.go

### Weight Normalization
| # | Test | Description |
|---|------|-------------|
| 1 | `TestWeightNormalization/empty_slice` | 空切片返回空切片 |
| 2 | `TestWeightNormalization/equal_weights` | 等权重归一后和为 1.0 |
| 3 | `TestWeightNormalization/different_weights` | 不等权重归一后和为 1.0 |
| 4 | `TestWeightNormalization/all_zeros_->_uniform` | 全零权重 → 均匀分配 |
| 5 | `TestWeightNormalization/single_weight` | 单元素归一为 1.0 |
| 6 | `TestWeightNormalizationProportions` | 1:2:3 各占 1/6、2/6、3/6 |

### Score Level
| # | Test | Description |
|---|------|-------------|
| 7 | `TestGetScoreLevel` | 覆盖所有阈值边界（excellent/good/normal/warning/danger） |

### Range Scoring
| # | Test | Description |
|---|------|-------------|
| 8 | `TestRangeScoring_ExactMatch` | 值落在区间内返回该区间评分 |
| 9 | `TestRangeScoring_UpperBandMatch` | 值落在上区间正确命中 |
| 10 | `TestRangeScoring_OutOfRange_Interpolated` | 值超出所有区间 → 插值/回落 |
| 11 | `TestRangeScoring_EmptyRanges_DefaultScore` | 空区间配置 → 默认分 60 |
| 12 | `TestRangeScoring_MetricIdentifier` | MetricName = `{name}_{aggType}` |
| 13 | `TestRangeScoring_WithAlias` | 配置 Alias 时 DisplayName 使用别名 |

### Threshold Scoring
| # | Test | Description |
|---|------|-------------|
| 14 | `TestThresholdScoring_LessThan` | `< 100` 匹配 → 返回对应分 |
| 15 | `TestThresholdScoring_GreaterThanEqual` | `>= 100` 匹配 → 返回对应分 |
| 16 | `TestThresholdScoring_Equal` | `= 42` 精确相等匹配 |
| 17 | `TestThresholdScoring_AllOperators` | 逐一测试 `<`, `<=`, `=`, `>=`, `>` 边界 |

### Report Score
| # | Test | Description |
|---|------|-------------|
| 18 | `TestCalculateReportScore_Empty` | 空用例列表 → TotalScore=0 |
| 19 | `TestCalculateReportScore_EqualWeight` | 两用例各 0.5 权重，加权均值正确 |
| 20 | `TestCalculateReportScore_Single` | 单用例全权重，Level 正确 |
| 21 | `TestCalculateReportScore_WeightsAssigned` | 三用例各分配 1/3 权重 |

---

## pkg/aggregator/aggregator_test.go

### AggregateRaw
| # | Test | Description |
|---|------|-------------|
| 22 | `TestAggregateRaw_Empty` | nil 输入返回空切片 |
| 23 | `TestAggregateRaw_SinglePoint` | 单点生成 5 种聚合类型 |
| 24 | `TestAggregateRaw_AvgCalculation` | `[10,20,30]` avg = 20 |
| 25 | `TestAggregateRaw_MinCalculation` | `[10,5,30]` min = 5 |
| 26 | `TestAggregateRaw_MaxCalculation` | `[10,5,30]` max = 30 |
| 27 | `TestAggregateRaw_CountCalculation` | 5 个点 count = 5 |
| 28 | `TestAggregateRaw_LastCalculation` | `[1,2,99]` last = 99 |
| 29 | `TestAggregateRaw_LevelAndDatasourcePreserved` | level 和 datasourceId 保留 |

### Aggregate (re-aggregate)
| # | Test | Description |
|---|------|-------------|
| 30 | `TestAggregate_Empty` | nil 输入返回空切片 |
| 31 | `TestAggregate_AvgOfAvg` | avg 聚合再聚合，均值正确 |

### Timestamp helpers
| # | Test | Description |
|---|------|-------------|
| 32 | `TestAlignTimestamp` | 42s 对齐到 15s 边界得 30s |
| 33 | `TestAlignTimestamp_AlreadyAligned` | 已对齐时间不变 |

### CalculateExpectedPoints
| # | Test | Description |
|---|------|-------------|
| 34 | `TestCalculateExpectedPoints` | 多种 interval/source 组合，含 source=0 边界 |

### ValidateAggregationChain
| # | Test | Description |
|---|------|-------------|
| 35 | `TestValidateAggregationChain_Valid` | 合法链 raw→15s→30s→1m |
| 36 | `TestValidateAggregationChain_Empty` | 空 levels → 报错 |
| 37 | `TestValidateAggregationChain_FirstNotRaw` | 首层非 raw → 报错 |
| 38 | `TestValidateAggregationChain_UnknownSource` | 引用不存在的 source → 报错 |

### Config
| # | Test | Description |
|---|------|-------------|
| 39 | `TestConfigValidate_DefaultConfig` | DefaultConfig() 通过校验 |
| 40 | `TestConfigValidate_Disabled` | Enabled=false 跳过校验 |
| 41 | `TestConfigValidate_EmptyLevels` | Enabled=true 但无 levels → 报错 |
| 42 | `TestConfigGetLevel` | 按名称查找 level，不存在返回 nil |
| 43 | `TestConfigGetSourceLevel` | 返回 source level，raw 返回 nil |

### AggregationType
| # | Test | Description |
|---|------|-------------|
| 44 | `TestAggregationTypeIndex` | avg=0, min=1, max=2, count=3, last=4 |

### Labels
| # | Test | Description |
|---|------|-------------|
| 45 | `TestFilterBusinessLabels_InternalLabelsRemoved` | 内部 label 删除，业务 label 保留 |

---

## internal/handler/health_test.go

### HealthHandler
| # | Test | Description |
|---|------|-------------|
| 46 | `TestHealthHandler_Status200` | 返回 200 OK |
| 47 | `TestHealthHandler_ContentType` | Content-Type: application/json |
| 48 | `TestHealthHandler_BodyHasStatusOK` | body.status = "ok"，body.time 存在 |
| 49 | `TestHealthHandler_TimeIsPositive` | body.time 是正数时间戳 |

### writeJSON helper
| # | Test | Description |
|---|------|-------------|
| 50 | `TestWriteJSON_SetsStatusCode` | 自定义状态码正确写入 |
| 51 | `TestWriteJSON_WrapsInCodeData` | 响应包含 `code=0` 和 `data` 字段 |

### writeError helper
| # | Test | Description |
|---|------|-------------|
| 52 | `TestWriteError_SetsStatusCode` | 错误状态码正确写入 |
| 53 | `TestWriteError_BodyHasMessage` | body.message 和 body.code 正确 |
| 54 | `TestWriteError_ContentTypeJSON` | Content-Type: application/json |

### parseLimit helper
| # | Test | Description |
|---|------|-------------|
| 55 | `TestParseLimit_Default` | 无 query 参数返回默认值 |
| 56 | `TestParseLimit_FromQuery` | `?limit=100` 正确解析 |
| 57 | `TestParseLimit_InvalidQuery` | 非数字 limit → 返回默认值 |
| 58 | `TestParseLimit_ZeroQuery` | `?limit=0`（不合法）→ 返回默认值 |

---

**总计：58 个测试用例**

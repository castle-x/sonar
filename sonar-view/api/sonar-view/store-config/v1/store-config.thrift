namespace go store_config

struct StoreConfig {
  1: required string id,
  2: required string name,
  3: required string addr,
  4: optional string description,
  5: required i64 created_at,
  6: required i64 updated_at,
}

struct CreateStoreConfigRequest {
  1: required string name,
  2: required string addr,
  3: optional string description,
}

struct CreateStoreConfigResponse {
  1: required StoreConfig config,
}

struct GetStoreConfigRequest {
  1: required string id,
}

struct GetStoreConfigResponse {
  1: required StoreConfig config,
}

struct ListStoreConfigsRequest {
}

struct ListStoreConfigsResponse {
  1: required list<StoreConfig> list,
  2: required i32 total,
}

struct UpdateStoreConfigRequest {
  1: required string id,
  2: optional string name,
  3: optional string addr,
  4: optional string description,
}

struct DeleteStoreConfigRequest {
  1: required string id,
}

service StoreConfigService {
  CreateStoreConfigResponse CreateStoreConfig(1: CreateStoreConfigRequest req),
  GetStoreConfigResponse GetStoreConfig(1: GetStoreConfigRequest req),
  ListStoreConfigsResponse ListStoreConfigs(1: ListStoreConfigsRequest req),
  void UpdateStoreConfig(1: UpdateStoreConfigRequest req),
  void DeleteStoreConfig(1: DeleteStoreConfigRequest req),
}

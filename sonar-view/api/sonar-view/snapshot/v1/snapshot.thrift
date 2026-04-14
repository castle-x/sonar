namespace go snapshot

// SnapshotStatus: "pending" | "building" | "done" | "failed"

struct Snapshot {
  1: required string id,
  2: required string name,
  3: optional string description,
  4: required list<string> tags,
  5: optional string app_id,
  6: required list<string> tap_ids,
  7: optional i64 start_time,
  8: optional i64 end_time,
  9: required string status,
  10: optional string error_msg,
  11: required i32 chunk_count,
  12: required i64 total_bytes,
  13: required i64 created_at,
  14: required i64 updated_at,
}

struct CreateSnapshotRequest {
  1: required string name,
  2: optional string description,
  3: optional list<string> tags,
  4: optional string app_id,
  5: optional list<string> tap_ids,
  6: optional i64 start_time,
  7: optional i64 end_time,
}

struct CreateSnapshotResponse {
  1: required Snapshot snapshot,
}

struct GetSnapshotRequest {
  1: required string id,
}

struct GetSnapshotResponse {
  1: required Snapshot snapshot,
}

struct ListSnapshotsRequest {
  1: optional string app_id,
}

struct ListSnapshotsResponse {
  1: required list<Snapshot> list,
  2: required i32 total,
}

struct DeleteSnapshotRequest {
  1: required string id,
}

service SnapshotService {
  CreateSnapshotResponse CreateSnapshot(1: CreateSnapshotRequest req),
  GetSnapshotResponse GetSnapshot(1: GetSnapshotRequest req),
  ListSnapshotsResponse ListSnapshots(1: ListSnapshotsRequest req),
  void DeleteSnapshot(1: DeleteSnapshotRequest req),
}

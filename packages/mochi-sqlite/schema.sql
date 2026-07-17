PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS mochi_space (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  deleted_time TEXT
);

CREATE TABLE IF NOT EXISTS mochi_base (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  deleted_time TEXT,
  FOREIGN KEY (space_id) REFERENCES mochi_space(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_base_space_id ON mochi_base(space_id);
CREATE INDEX IF NOT EXISTS idx_mochi_base_sort_order ON mochi_base(sort_order);

CREATE TABLE IF NOT EXISTS mochi_table (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  deleted_time TEXT,
  FOREIGN KEY (base_id) REFERENCES mochi_base(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_table_base_id ON mochi_table(base_id);
CREATE INDEX IF NOT EXISTS idx_mochi_table_sort_order ON mochi_table(sort_order);

CREATE TABLE IF NOT EXISTS mochi_field (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  cell_value_type TEXT NOT NULL,
  options_json TEXT,
  meta_json TEXT,
  ai_config_json TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_computed INTEGER NOT NULL DEFAULT 0,
  is_lookup INTEGER NOT NULL DEFAULT 0,
  not_null INTEGER NOT NULL DEFAULT 0,
  unique_value INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  deleted_time TEXT,
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_field_table_id ON mochi_field(table_id);
CREATE INDEX IF NOT EXISTS idx_mochi_field_sort_order ON mochi_field(sort_order);

CREATE TABLE IF NOT EXISTS mochi_view (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  options_json TEXT,
  column_meta_json TEXT,
  filter_json TEXT,
  sort_json TEXT,
  group_json TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  deleted_time TEXT,
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_view_table_id ON mochi_view(table_id);
CREATE INDEX IF NOT EXISTS idx_mochi_view_sort_order ON mochi_view(sort_order);

CREATE TABLE IF NOT EXISTS mochi_record (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  auto_number INTEGER,
  fields_json TEXT NOT NULL DEFAULT '{}',
  order_json TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_modified_time TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_time TEXT,
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_record_table_id ON mochi_record(table_id);
CREATE INDEX IF NOT EXISTS idx_mochi_record_deleted_time ON mochi_record(table_id, deleted_time);

CREATE TABLE IF NOT EXISTS mochi_record_history (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_record_history_record
  ON mochi_record_history(table_id, record_id, created_time);

CREATE TABLE IF NOT EXISTS mochi_op_batch (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undone_time TEXT,
  redone_time TEXT
);

CREATE TABLE IF NOT EXISTS mochi_op (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  record_id TEXT,
  field_id TEXT,
  op_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (batch_id) REFERENCES mochi_op_batch(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_op_batch_time ON mochi_op_batch(created_time);
CREATE INDEX IF NOT EXISTS idx_mochi_op_batch_id ON mochi_op(batch_id);

CREATE TABLE IF NOT EXISTS mochi_trash (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  parent_resource_id TEXT,
  snapshot_json TEXT NOT NULL,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mochi_trash_resource
  ON mochi_trash(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS mochi_attachment (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  name TEXT,
  hash TEXT,
  size INTEGER,
  mimetype TEXT,
  path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  thumbnail_path TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_time TEXT
);

CREATE TABLE IF NOT EXISTS mochi_attachment_ref (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (attachment_id) REFERENCES mochi_attachment(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mochi_attachment_ref_record
  ON mochi_attachment_ref(table_id, record_id);

CREATE TABLE IF NOT EXISTS mochi_setting (
  name TEXT PRIMARY KEY,
  content_json TEXT NOT NULL,
  last_modified_time TEXT
);

CREATE TABLE IF NOT EXISTS mochi_import_source (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  profile_id TEXT,
  table_id TEXT,
  last_sync_time TEXT,
  state_json TEXT,
  created_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (table_id) REFERENCES mochi_table(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mochi_import_source_profile
  ON mochi_import_source(profile_id);

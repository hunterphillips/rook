import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { REPO_ROOT } from "../../infrastructure/paths.js";

/** SQLite connection and schema bootstrap for one environment repository. */
export class EnvironmentRepositoryDatastore {
  readonly db: DatabaseSync;

  constructor(location = path.join(REPO_ROOT, "environment-repository.db")) {
    if (location !== ":memory:") mkdirSync(path.dirname(location), { recursive: true });
    this.db = new DatabaseSync(location);
    this.createSchema();
  }

  close(): void {
    this.db.close();
  }

  private createSchema(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS environments (
        environment_id TEXT NOT NULL,
        repository TEXT NOT NULL DEFAULT 'personal',
        display_name TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (repository, environment_id)
      );

      CREATE TABLE IF NOT EXISTS capabilities (
        capability_id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('skill', 'instructions', 'llms-txt', 'facts', 'mcp', 'app')),
        name TEXT NOT NULL,
        files_json TEXT NOT NULL,
        content_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bundles (
        bundle_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        repository TEXT NOT NULL DEFAULT 'personal',
        capability_id TEXT NOT NULL REFERENCES capabilities(capability_id) ON DELETE CASCADE,
        publisher TEXT NOT NULL DEFAULT 'default',
        deleted_at TEXT,
        PRIMARY KEY (repository, bundle_id, capability_id),
        FOREIGN KEY (repository, environment_id) REFERENCES environments(repository, environment_id) ON DELETE CASCADE
      );
    `);
    this.ensureRepositoryScope();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS bundles_environment_idx ON bundles(repository, environment_id);
      CREATE INDEX IF NOT EXISTS bundles_capability_idx ON bundles(capability_id);
    `);
  }

  private ensureRepositoryScope(): void {
    const environmentColumns = this.db.prepare("PRAGMA table_info(environments)").all() as Array<Record<string, unknown>>;
    const bundleColumns = this.db.prepare("PRAGMA table_info(bundles)").all() as Array<Record<string, unknown>>;
    const environmentHadRepository = environmentColumns.some((column) => column.name === "repository");
    const bundlesHadRepository = bundleColumns.some((column) => column.name === "repository");
    if (!environmentHadRepository) {
      // Existing rows are personal rows, so SQLite's default backfills their repository.
      this.db.exec("ALTER TABLE environments ADD COLUMN repository TEXT NOT NULL DEFAULT 'personal'");
    }
    if (!bundlesHadRepository) {
      this.db.exec("ALTER TABLE bundles ADD COLUMN repository TEXT NOT NULL DEFAULT 'personal'");
    }

    const primaryKey = (this.db.prepare("PRAGMA table_info(environments)").all() as Array<Record<string, unknown>>)
      .filter((column) => Number(column.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((column) => String(column.name));
    if (primaryKey.join(",") === "repository,environment_id") return;

    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.exec(`
        BEGIN;
        ALTER TABLE bundles RENAME TO bundles_legacy_repository_scope;
        ALTER TABLE environments RENAME TO environments_legacy_repository_scope;

        CREATE TABLE environments (
          environment_id TEXT NOT NULL,
          repository TEXT NOT NULL DEFAULT 'personal',
          display_name TEXT NOT NULL,
          description TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          PRIMARY KEY (repository, environment_id)
        );
        INSERT INTO environments (environment_id, repository, display_name, description, metadata_json)
        SELECT environment_id, repository, display_name, description, metadata_json
        FROM environments_legacy_repository_scope;

        CREATE TABLE bundles (
          bundle_id TEXT NOT NULL,
          environment_id TEXT NOT NULL,
          repository TEXT NOT NULL DEFAULT 'personal',
          capability_id TEXT NOT NULL REFERENCES capabilities(capability_id) ON DELETE CASCADE,
          publisher TEXT NOT NULL DEFAULT 'default',
          deleted_at TEXT,
          PRIMARY KEY (repository, bundle_id, capability_id),
          FOREIGN KEY (repository, environment_id) REFERENCES environments(repository, environment_id) ON DELETE CASCADE
        );
        INSERT INTO bundles (bundle_id, environment_id, repository, capability_id, publisher, deleted_at)
        SELECT bundle_id, environment_id, repository, capability_id, publisher, deleted_at
        FROM bundles_legacy_repository_scope;

        DROP TABLE bundles_legacy_repository_scope;
        DROP TABLE environments_legacy_repository_scope;
        CREATE INDEX bundles_environment_idx ON bundles(repository, environment_id);
        CREATE INDEX bundles_capability_idx ON bundles(capability_id);
        COMMIT;
      `);
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }
}

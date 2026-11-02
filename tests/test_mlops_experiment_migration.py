"""Verify the experiment migration structure without touching a live database."""
from pathlib import Path

from alembic.script import ScriptDirectory


def test_experiment_migration_is_alembic_head():
    root = Path(__file__).resolve().parents[1]
    script = ScriptDirectory(str(root / "migrations"))
    revision = script.get_revision("e91b7c4a620f")
    assert revision is not None
    assert revision.down_revision == "c32e71a9d404"
    assert "e91b7c4a620f" in script.get_heads()


def test_experiment_migration_creates_only_isolated_tables(monkeypatch):
    import importlib

    migration = importlib.import_module(
        "migrations.versions.e91b7c4a620f_add_ml_experiment_tracking"
    )
    created = []
    indexes = []
    monkeypatch.setattr(migration.op, "create_table", lambda name, *args, **kwargs: created.append(name))
    monkeypatch.setattr(migration.op, "create_index", lambda name, table, columns: indexes.append((name, table)))
    migration.upgrade()
    assert created == [
        "ml_experiments",
        "ml_experiment_runs",
        "ml_experiment_metrics",
    ]
    assert {table for _, table in indexes} == set(created)
    assert "model_runs" not in created

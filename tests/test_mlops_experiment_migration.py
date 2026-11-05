"""Verify the experiment migration structure without touching a live database."""
from pathlib import Path

from alembic.script import ScriptDirectory


def test_experiment_migration_is_in_alembic_history():
    root = Path(__file__).resolve().parents[1]
    script = ScriptDirectory(str(root / "migrations"))
    revision = script.get_revision("e91b7c4a620f")
    assert revision is not None
    assert revision.down_revision == "c32e71a9d404"
    active_revision = script.get_revision("b8e63a7c1d20")
    assert active_revision is not None
    assert active_revision.down_revision == "e91b7c4a620f"
    finops_revision = script.get_revision("b7a1c93e4d20")
    assert finops_revision is not None
    assert finops_revision.down_revision == "b8e63a7c1d20"
    assert script.get_heads() == ["b7a1c93e4d20"]


def test_experiment_migration_creates_only_isolated_tables(monkeypatch):
    import importlib.util

    root = Path(__file__).resolve().parents[1]
    migration_path = root / "migrations" / "versions" / "e91b7c4a620f_add_ml_experiment_tracking.py"
    spec = importlib.util.spec_from_file_location("experiment_tracking_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
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

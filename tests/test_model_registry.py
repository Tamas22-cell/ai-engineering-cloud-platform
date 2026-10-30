from pydantic import ValidationError
import pytest

from api.model_registry import ModelCreate, StageUpdate


def test_valid_model():
    model = ModelCreate(name="classifier", version="v1", framework="pytorch")
    assert model.name == "classifier"


def test_model_name_is_required():
    with pytest.raises(ValidationError):
        ModelCreate(name="", version="v1", framework="pytorch")


def test_stage_rejects_invalid_values():
    with pytest.raises(ValidationError):
        StageUpdate(stage="unreviewed")


def test_production_stage_is_valid():
    assert StageUpdate(stage="production").stage == "production"

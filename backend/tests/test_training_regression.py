"""Deterministic regression training smoke checks (no database required)."""
import numpy as np


def test_synthetic_regression_converges():
    rng = np.random.default_rng(42)
    x = rng.normal(size=200)
    y = 2.5 * x + 0.7 + rng.normal(scale=0.15, size=200)
    indices = rng.permutation(200)
    train, test = indices[:160], indices[160:]
    mean, std = x[train].mean(), x[train].std()
    xt, xv = (x[train] - mean) / std, (x[test] - mean) / std
    weight = bias = 0.0
    for _ in range(200):
        error = weight * xt + bias - y[train]
        weight -= 0.05 * float(2 * np.mean(error * xt))
        bias -= 0.05 * float(2 * np.mean(error))
    prediction = weight * xv + bias
    mae = float(np.mean(np.abs(y[test] - prediction)))
    assert mae < 0.3
    assert np.isfinite(weight)
    assert np.isfinite(bias)

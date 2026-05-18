import hashlib
import hmac
import os
from importlib import reload

import pytest

from apps.api import config


@pytest.fixture
def app_secret(monkeypatch):
    secret = "test-secret"
    monkeypatch.setenv("META_APP_SECRET", secret)
    config.get_settings.cache_clear()
    reload(config)
    yield secret
    config.get_settings.cache_clear()


def test_valid_signature_passes(app_secret):
    from apps.api.services.meta import verify_signature
    body = b'{"hello":"world"}'
    sig = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature(body=body, signature_header=sig) is True


def test_tampered_body_fails(app_secret):
    from apps.api.services.meta import verify_signature
    body = b'{"hello":"world"}'
    sig = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature(body=b'{"hello":"tampered"}', signature_header=sig) is False


def test_missing_signature_fails(app_secret):
    from apps.api.services.meta import verify_signature
    assert verify_signature(body=b"{}", signature_header=None) is False
    assert verify_signature(body=b"{}", signature_header="") is False


def test_missing_secret_fails(monkeypatch):
    monkeypatch.setenv("META_APP_SECRET", "")
    config.get_settings.cache_clear()
    from apps.api.services.meta import verify_signature
    assert verify_signature(body=b"{}", signature_header="sha256=deadbeef") is False

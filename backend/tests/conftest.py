import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent

for path in (REPO_ROOT, BACKEND_DIR):
    path_str = str(path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from backend.app import create_app


class FakeRedisSearchIndex:
    def __init__(self, redis_client):
        self.redis_client = redis_client

    def info(self):
        return {}

    def create_index(self, *args, **kwargs):
        return True

    def search(self, query, query_params=None):
        query_params = query_params or {}
        query_vector = np.frombuffer(query_params.get("vec", b""), dtype=np.float32)
        docs = []

        for mapping in self.redis_client.hashes.values():
            embedding = np.frombuffer(mapping["embedding"], dtype=np.float32)
            if query_vector.size == 0 or embedding.size == 0 or query_vector.size != embedding.size:
                continue

            denominator = np.linalg.norm(query_vector) * np.linalg.norm(embedding)
            distance = 1.0 if denominator == 0 else 1.0 - float(np.dot(query_vector, embedding) / denominator)
            docs.append(
                SimpleNamespace(
                    employee_id=mapping["employee_id"],
                    employee_code=mapping["employee_code"],
                    full_name=mapping["full_name"],
                    score=distance,
                )
            )

        docs.sort(key=lambda doc: doc.score)
        return SimpleNamespace(docs=docs[:5])


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.hashes = {}

    def ping(self):
        return True

    def incr(self, key):
        self.values[key] = int(self.values.get(key, 0)) + 1
        return self.values[key]

    def expire(self, key, seconds):
        return True

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, *args, **kwargs):
        self.values[key] = value
        return True

    def setex(self, key, time, value):
        self.values[key] = value
        return True

    def hset(self, key, mapping):
        self.hashes[key] = mapping
        return len(mapping)

    def delete(self, *keys):
        deleted = 0
        for key in keys:
            deleted += int(self.values.pop(key, None) is not None)
            deleted += int(self.hashes.pop(key, None) is not None)
        return deleted

    def scan(self, cursor=0, match=None, count=100):
        if cursor != 0:
            return 0, []
        prefix = (match or "").rstrip("*")
        keys = [key for key in self.hashes if key.startswith(prefix)]
        return 0, keys

    def scan_iter(self, match=None, count=100):
        _, keys = self.scan(match=match, count=count)
        return iter(keys)

    def keys(self, pattern):
        _, keys = self.scan(match=pattern)
        return keys

    def ft(self, index_name):
        return FakeRedisSearchIndex(self)


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch, tmp_path):
    redis_client = FakeRedis()

    class FakeInsightFaceRecognizer:
        def get_feat(self, img):
            return np.zeros(512, dtype=np.float32)

    def get_fake_insightface_recognizer(service):
        if getattr(service, "_insightface_recognizer", None) is None:
            service._insightface_recognizer = FakeInsightFaceRecognizer()
        return service._insightface_recognizer

    def init_redis(url):
        return redis_client

    def get_redis():
        return redis_client

    from backend.app.config import Config
    import backend.app as app_module
    from backend.app.routes import guest as guest_module
    from backend.app.services.embedding import EmbeddingService
    from backend.app.services import rate_limiter, redis_client as redis_client_module, redis_vector_store

    monkeypatch.setattr(Config, "SESSION_TYPE", "filesystem")
    monkeypatch.setattr(Config, "SESSION_FILE_DIR", str(tmp_path / "sessions"), raising=False)
    monkeypatch.setattr(EmbeddingService, "_get_insightface_recognizer", get_fake_insightface_recognizer)
    monkeypatch.setattr(app_module.EmbeddingService, "_get_insightface_recognizer", get_fake_insightface_recognizer)
    monkeypatch.setattr(redis_client_module, "init_redis", init_redis)
    monkeypatch.setattr(redis_client_module, "get_redis", get_redis)
    monkeypatch.setattr(redis_vector_store, "get_redis", get_redis)
    monkeypatch.setattr(rate_limiter, "get_redis", get_redis)
    guest_module._guest_rate_limiter = None

    return redis_client


@pytest.fixture
def app(tmp_path):
    data_dir = tmp_path / "data"
    app = create_app(
        {
            "TESTING": True,
            "APP_DB_PATH": data_dir / "app.db",
            "CHECKIN_DIR": data_dir / "checkins",
            "FACES_DIR": data_dir / "faces",
        }
    )

    with app.app_context():
        yield app


@pytest.fixture
def client(app):
    return app.test_client()

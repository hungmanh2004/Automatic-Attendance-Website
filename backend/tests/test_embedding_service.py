import inspect

import backend.app as app_module
from backend.app.services.embedding import EmbeddingService


def test_embedding_service_prewarm_uses_lazy_insightface_loader_and_first_inference():
    class FakeRecognizer:
        def __init__(self):
            self.calls = []

        def get_feat(self, img):
            self.calls.append(img.shape)
            return [0.0] * 512

    class PrewarmEmbeddingService(EmbeddingService):
        def __init__(self):
            super().__init__()
            self.loader_calls = 0
            self.recognizer = FakeRecognizer()

        def _get_insightface_recognizer(self):
            self.loader_calls += 1
            return self.recognizer

    service = PrewarmEmbeddingService()

    service.prewarm()

    assert service.loader_calls == 1
    assert service.recognizer.calls == [(112, 112, 3)]


def test_app_factory_uses_public_embedding_prewarm_api():
    source = inspect.getsource(app_module._initialize_services)

    assert "embedding_service.prewarm()" in source
    assert "_get_insightface_recognizer" not in source

import inspect

import backend.app as app_module
from backend.app.services.embedding import EmbeddingService


def test_embedding_service_prewarm_uses_lazy_insightface_loader():
    class PrewarmEmbeddingService(EmbeddingService):
        def __init__(self):
            super().__init__()
            self.loader_calls = 0

        def _get_insightface_recognizer(self):
            self.loader_calls += 1
            return object()

    service = PrewarmEmbeddingService()

    service.prewarm()

    assert service.loader_calls == 1


def test_app_factory_uses_public_embedding_prewarm_api():
    source = inspect.getsource(app_module._initialize_services)

    assert "embedding_service.prewarm()" in source
    assert "_get_insightface_recognizer" not in source

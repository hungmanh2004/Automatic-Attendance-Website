from .redis_vector_store import RedisVectorStore


class FaceIndexService:
    def __init__(self, threshold=0.6):
        self.threshold = threshold
        self._store = RedisVectorStore()

    def setup(self) -> None:
        self._store.setup_index()

    def upsert(
        self,
        employee_id: int,
        sample_index: int,
        employee_code: str,
        full_name: str,
        embedding: list[float],
    ) -> None:
        self._store.upsert_face_sample(employee_id, sample_index, employee_code, full_name, embedding)

    def delete_sample(self, employee_id: int, sample_index: int) -> None:
        self._store.delete_face_sample(employee_id, sample_index)

    def delete_employee(self, employee_id: int) -> None:
        self._store.delete_employee_samples(employee_id)

    def find_match(self, embedding: list[float]) -> dict | None:
        return self._store.find_best_match(embedding, threshold=self.threshold)

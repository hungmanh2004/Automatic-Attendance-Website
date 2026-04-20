import numpy as np

from .vector_store import VectorStore


class InMemoryVectorStore(VectorStore):
    """VectorStore adapter for unit tests and local experiments."""

    def __init__(self):
        self._entries = {}

    def setup_index(self) -> None:
        return None

    def upsert_face_sample(
        self,
        employee_id: int,
        sample_index: int,
        employee_code: str,
        full_name: str,
        embedding: list[float],
    ) -> None:
        self._entries[(employee_id, sample_index)] = {
            "employee_id": employee_id,
            "sample_index": sample_index,
            "employee_code": employee_code,
            "full_name": full_name,
            "embedding": np.array(embedding, dtype=np.float32),
        }

    def delete_face_sample(self, employee_id: int, sample_index: int) -> None:
        self._entries.pop((employee_id, sample_index), None)

    def delete_employee_samples(self, employee_id: int) -> None:
        for key in list(self._entries):
            if key[0] == employee_id:
                self._entries.pop(key, None)

    def find_best_match(
        self, embedding: list[float], threshold: float = 0.6
    ) -> dict | None:
        query_vector = np.array(embedding, dtype=np.float32)
        best_entry = None
        best_distance = None

        for entry in self._entries.values():
            stored_vector = entry["embedding"]
            if query_vector.size == 0 or stored_vector.size == 0 or query_vector.size != stored_vector.size:
                continue

            denominator = np.linalg.norm(query_vector) * np.linalg.norm(stored_vector)
            distance = 1.0 if denominator == 0 else 1.0 - float(np.dot(query_vector, stored_vector) / denominator)
            if best_distance is None or distance < best_distance:
                best_entry = entry
                best_distance = distance

        if best_entry is None or best_distance is None or best_distance > threshold:
            return None

        return {
            "employee_id": best_entry["employee_id"],
            "employee_code": best_entry["employee_code"],
            "full_name": best_entry["full_name"],
            "distance": best_distance,
        }

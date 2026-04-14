from abc import ABC, abstractmethod


class VectorStore(ABC):
    """Abstract interface for face vector storage and KNN search."""

    @abstractmethod
    def setup_index(self) -> None:
        """Create or verify the vector index exists."""

    @abstractmethod
    def upsert_face_sample(
        self,
        employee_id: int,
        sample_index: int,
        employee_code: str,
        full_name: str,
        embedding: list[float],
    ) -> None:
        """Insert or update a face sample entry."""

    @abstractmethod
    def delete_face_sample(self, employee_id: int, sample_index: int) -> None:
        """Remove a specific face sample."""

    @abstractmethod
    def delete_employee_samples(self, employee_id: int) -> None:
        """Remove all face samples for an employee."""

    @abstractmethod
    def find_best_match(
        self, embedding: list[float], threshold: float = 0.6
    ) -> dict | None:
        """Return the closest matching employee or None if below threshold.

        Returns dict with keys: employee_id, employee_code, full_name, distance.
        """

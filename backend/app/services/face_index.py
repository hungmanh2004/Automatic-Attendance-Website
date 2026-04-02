import json
import math

from ..extensions import db
from ..models import Employee, FaceSample


class FaceIndexService:
    def __init__(self, threshold=0.6):
        self.threshold = threshold
        self._entries = []

    def refresh(self):
        rows = (
            db.session.query(FaceSample, Employee)
            .join(Employee, FaceSample.employee_id == Employee.id)
            .filter(Employee.is_active.is_(True))
            .all()
        )
        self._entries = []

        for sample, employee in rows:
            try:
                embedding = [float(value) for value in json.loads(sample.embedding_json)]
            except (TypeError, ValueError, json.JSONDecodeError):
                continue

            self._entries.append(
                {
                    "employee_id": employee.id,
                    "employee_code": employee.employee_code,
                    "full_name": employee.full_name,
                    "embedding": embedding,
                }
            )

    def find_match(self, embedding):
        self.refresh()

        query_embedding = [float(value) for value in embedding]
        best_match = None

        for entry in self._entries:
            distance = _cosine_distance(query_embedding, entry["embedding"])
            if best_match is None or distance < best_match["distance"]:
                best_match = {
                    "employee_id": entry["employee_id"],
                    "employee_code": entry["employee_code"],
                    "full_name": entry["full_name"],
                    "distance": distance,
                }

        if best_match and best_match["distance"] <= self.threshold:
            return best_match
        return None


def _cosine_distance(left, right):
    if len(left) != len(right):
        return math.inf

    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return math.inf

    dot_product = sum(left_value * right_value for left_value, right_value in zip(left, right))
    cosine_similarity = dot_product / (left_norm * right_norm)
    return 1 - cosine_similarity

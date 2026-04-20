import pytest


def test_in_memory_vector_store_returns_closest_match_under_threshold():
    from backend.app.services.in_memory_vector_store import InMemoryVectorStore

    store = InMemoryVectorStore()
    store.upsert_face_sample(1, 1, "EMP-001", "Ada Lovelace", [1.0, 0.0])
    store.upsert_face_sample(2, 1, "EMP-002", "Grace Hopper", [0.0, 1.0])

    match = store.find_best_match([0.9, 0.1], threshold=0.02)

    assert match == {
        "employee_id": 1,
        "employee_code": "EMP-001",
        "full_name": "Ada Lovelace",
        "distance": pytest.approx(0.006116, abs=1e-6),
    }


def test_in_memory_vector_store_respects_threshold_and_deletes_samples():
    from backend.app.services.in_memory_vector_store import InMemoryVectorStore

    store = InMemoryVectorStore()
    store.upsert_face_sample(1, 1, "EMP-001", "Ada Lovelace", [1.0, 0.0])
    store.upsert_face_sample(1, 2, "EMP-001", "Ada Lovelace", [0.8, 0.2])
    store.upsert_face_sample(2, 1, "EMP-002", "Grace Hopper", [0.0, 1.0])

    assert store.find_best_match([0.0, 1.0], threshold=0.1)["employee_id"] == 2
    assert store.find_best_match([0.7, 0.3], threshold=0.01) is None

    store.delete_face_sample(2, 1)
    assert store.find_best_match([0.0, 1.0], threshold=0.1) is None

    store.delete_employee_samples(1)
    assert store.find_best_match([1.0, 0.0], threshold=0.1) is None

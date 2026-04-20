from pathlib import Path


def _declared_requirements():
    requirements_path = Path(__file__).resolve().parents[1] / "requirements.txt"
    packages = set()

    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        package_name = line.split("==", 1)[0].strip().lower().replace("_", "-")
        packages.add(package_name)

    return packages


def test_insightface_requires_onnxruntime_package():
    packages = _declared_requirements()

    assert "insightface" in packages
    assert "onnxruntime" in packages


def test_redis_vector_store_module_imports_successfully():
    import backend.app.services.redis_vector_store
    assert hasattr(backend.app.services.redis_vector_store, "RedisVectorStore")


def test_run_py_does_not_use_legacy_top_level_app_import():
    run_py_path = Path(__file__).resolve().parents[1] / "run.py"
    source = run_py_path.read_text(encoding="utf-8")
    legacy_import = "from " + "app import create_app"
    assert legacy_import not in source


def test_scripts_use_backend_package_imports():
    repo_root = Path(__file__).resolve().parents[2]

    for relative_path in (
        "scripts/create_manager.py",
        "scripts/migrate_redis_vector.py",
    ):
        source = (repo_root / relative_path).read_text(encoding="utf-8")
        assert "from " + "app import" not in source
        assert "from " + "app.extensions" not in source
        assert "from " + "app.models" not in source
        assert "from backend.app" in source


def test_create_manager_has_no_top_level_app_import_fallback():
    repo_root = Path(__file__).resolve().parents[2]
    source = (repo_root / "scripts/create_manager.py").read_text(encoding="utf-8")

    assert "except ModuleNotFoundError" not in source

from pathlib import Path

from app.infra.storage import LocalStorage


def test_local_storage_save_get_delete(tmp_path: Path) -> None:
    storage = LocalStorage(base_dir=tmp_path)

    job_id = "job-123"
    original_data = b"original-content"
    translated_data = b"translated-content"

    # save_original
    original_path_str = storage.save_original(job_id, original_data)
    original_path = Path(original_path_str)
    assert original_path.exists()
    assert original_path.read_bytes() == original_data

    # get_original_path
    assert Path(storage.get_original_path(job_id)).exists()

    # save_translated
    translated_path_str = storage.save_translated(job_id, translated_data)
    translated_path = Path(translated_path_str)
    assert translated_path.exists()
    assert translated_path.read_bytes() == translated_data

    # get_translated_path
    assert Path(storage.get_translated_path(job_id)).exists()

    # delete
    storage.delete_original(job_id)
    storage.delete_translated(job_id)
    assert not original_path.exists()
    assert not translated_path.exists()

from app.infra import jobs


class DummyStorage:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str]] = []

    def delete_original(self, job_id: str) -> None:
        self.deleted.append(("original", job_id))

    def delete_translated(self, job_id: str) -> None:
        self.deleted.append(("translated", job_id))


class DummyJobRepo:
    def __init__(self, items: list[dict]) -> None:
        self._items = items

    def get_expired_jobs(self, *, now: int, limit: int = 100) -> list[dict]:  # type: ignore[override]
        expired = [item for item in self._items if item.get("expiresAt") is not None and item["expiresAt"] <= now]
        return expired[:limit]


def test_cleanup_expired_jobs_impl(monkeypatch) -> None:
    # given: 세 개의 Job 중 두 개는 만료, 하나는 아직 유효
    items = [
        {"jobId": "job-a", "expiresAt": 100},
        {"jobId": "job-b", "expiresAt": 200},
        {"jobId": "job-c", "expiresAt": 300},
    ]

    dummy_repo = DummyJobRepo(items)
    dummy_storage = DummyStorage()

    # jobs 모듈의 전역 job_store/storage를 더미로 교체
    monkeypatch.setattr(jobs, "job_store", dummy_repo)
    monkeypatch.setattr(jobs, "storage", dummy_storage)

    # when: now=250 기준으로 정리 수행
    count = jobs.cleanup_expired_jobs_impl(now=250, limit=10)

    # then: job-a, job-b 두 개만 정리되어야 함
    assert count == 2

    deleted_ids = {job_id for (_kind, job_id) in dummy_storage.deleted}
    assert deleted_ids == {"job-a", "job-b"}

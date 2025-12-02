import time

import psycopg2

from app.config import settings
from app.infra.job_repository import JobRepository


def _clear_jobs() -> None:
    """테스트 격리를 위해 jobs 테이블을 비운다."""

    conn = psycopg2.connect(settings.db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM jobs")
    finally:
        conn.close()


def test_job_lifecycle_and_error_code() -> None:
    _clear_jobs()
    repo = JobRepository(settings.db_url)

    job_id = "test-job-1"
    expires_at = int(time.time()) + 3600

    # 생성 시 상태/메타데이터/TTL 기록
    repo.create_job(job_id, file_name="foo.pdf", expires_at=expires_at)

    assert repo.get_status(job_id) == "PENDING"

    job = repo.get_job(job_id)
    assert job is not None
    assert job["jobId"] == job_id
    assert job["fileName"] == "foo.pdf"
    assert job["expiresAt"] == expires_at
    assert job["errorCode"] is None

    # 상태 전이
    repo.set_status(job_id, "RUNNING")
    assert repo.get_status(job_id) == "RUNNING"

    # 에러 코드 기록
    repo.set_error(job_id, "TEST_ERROR")
    job_after_error = repo.get_job(job_id)
    assert job_after_error is not None
    assert job_after_error["lastStatus"] == "FAILED"
    assert job_after_error["errorCode"] == "TEST_ERROR"


def test_get_expired_jobs() -> None:
    _clear_jobs()
    repo = JobRepository(settings.db_url)

    now = int(time.time())
    expired_id = "expired-job"
    active_id = "active-job"

    repo.create_job(expired_id, expires_at=now - 10)
    repo.create_job(active_id, expires_at=now + 10)

    expired_jobs = repo.get_expired_jobs(now=now, limit=10)
    ids = {item["jobId"] for item in expired_jobs}

    assert expired_id in ids
    assert active_id not in ids


def test_set_page_count_updates_metadata() -> None:
    _clear_jobs()
    repo = JobRepository(settings.db_url)

    job_id = "page-count-job"
    repo.create_job(job_id)

    repo.set_page_count(job_id, 123)

    job = repo.get_job(job_id)
    assert job is not None
    assert job["pageCount"] == 123
